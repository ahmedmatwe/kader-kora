# يبني voice.wav (كل السطور + فواصل) و plan.json (أوقات المشاهد + الترجمة) من script.json + scenes.json
import json, subprocess, sys, os
d = sys.argv[1]; FF = '/opt/homebrew/opt/ffmpeg-full/bin/'
lines = json.load(open(f'{d}/script.json'))['lines']; scenes = json.load(open(f'{d}/scenes.json'))
GAP, LEAD, TAIL = 0.22, 0.2, 1.4
dur = lambda f: float(subprocess.check_output([FF + 'ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]))
t = LEAD; times = {}; inputs = []; parts = []
for i, l in enumerate(lines):
    src = f'{d}/voice/{l["id"]}.wav'; os.makedirs(f'{d}/build/lines', exist_ok=True); f = f'{d}/build/lines/{l["id"]}.wav'
    trim = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse,afade=t=in:d=0.01,areverse,afade=t=in:d=0.03,areverse'
    subprocess.run([FF + 'ffmpeg', '-loglevel', 'error', '-y', '-i', src, '-af', trim, f], check=True)
    L = dur(f); times[l['id']] = (t, t + L)
    inputs += ['-i', f]; parts.append(f'[{i}]aresample=48000,adelay={int(t*1000)}|{int(t*1000)}[a{i}]'); t += L + GAP
total = round(t - GAP + TAIL, 2)
mix = ';'.join(parts) + ';' + ''.join(f'[a{i}]' for i in range(len(lines))) + f'amix=inputs={len(lines)}:normalize=0,apad,atrim=0:{total},loudnorm=I=-14:TP=-1.5:LRA=9[o]'
os.makedirs(f'{d}/build', exist_ok=True)
subprocess.run([FF + 'ffmpeg', '-loglevel', 'error', '-y', *inputs, '-filter_complex', mix, '-map', '[o]', '-ar', '48000', f'{d}/build/voice.wav'], check=True)
# ترجمة: كل سطر بيتقسم لجمل قصيرة (≤5 كلمات أو عند الفاصلة) والوقت بالنسبة لعدد الحروف
caps = []
for l in lines:
    s, e = times[l['id']]; vo = l['vo'].replace('..', '،')
    for nm in ['ترانسفير ماركت', 'حسام حسن', 'بوب برادلي', 'صدى البلد', 'أمم إفريقيا', 'التسعة وستين', 'تمانية وستين', 'خمسة صفر', 'ألفين وتلاتاشر', 'عشر تغييرات', 'جون يعادل', 'الهداف التاريخي']:
        vo = vo.replace(nm, nm.replace(' ', '\u00a0'))
    words = vo.split(' '); chunks = []; cur = []
    for w in words:
        cur.append(w)
        if len(' '.join(cur)) >= 22 or w.endswith(('،', '.', '؟', ',')): chunks.append(' '.join(cur)); cur = []
    if cur: chunks.append(' '.join(cur))
    merged = []  # جملة من كلمة واحدة بتتقري بسرعة جدًا → تتلزق في اللي قبلها أو بعدها
    for c in chunks:
        if merged and (len(c.split()) == 1 or len(merged[-1].split()) == 1): merged[-1] += ' ' + c
        else: merged.append(c)
    chunks = merged
    n = sum(len(c) for c in chunks); x = s
    for c in chunks:
        y = x + (e - s) * len(c) / n; txt = c.strip('،.,')
        for k in l.get('hi', []): txt = txt.replace(k, f'*{k}*')
        caps.append({'start': round(x, 2), 'end': round(y, 2), 'text': txt.replace('\u00a0', ' ')}); x = y
out = []
for sc in scenes['scenes']:
    a, b = times[sc.pop('from')][0], times[sc.pop('to')][1]
    out.append({**sc, 'start': round(a - (LEAD if not out else GAP / 2), 2), 'end': round(b + GAP / 2, 2)})
out[-1]['end'] = total
plan = {'date': scenes.get('date') or __import__('os').environ.get('PUB_DATE') or __import__('datetime').datetime.now(__import__('zoneinfo').ZoneInfo('Africa/Cairo')).strftime('%Y-%m-%d'), 'duration': total, 'audio': 'media/voice.wav', 'trend': scenes['trend'], 'sources': scenes['sources'], 'scenes': out, 'captions': caps}
if scenes.get('music'): plan['music'] = scenes['music']
json.dump(plan, open(f'{d}/build/plan.json', 'w'), ensure_ascii=False, indent=1)
json.dump({k: [round(v[0], 2), round(v[1], 2)] for k, v in times.items()}, open(f'{d}/build/timing.json', 'w'))
print('total', total); print(json.dumps(times))
