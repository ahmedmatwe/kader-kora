// فريق الصوت: طلب TTS واحد للسكريبت كله (توفير الكوتة: ~10 طلبات/يوم لكل مفتاح) بصوت Fenrir،
// بعدين faster-whisper يطلّع وقت كل كلمة → نقسم الصوت لسطور (voice/<id>.wav) → build_plan يكمل زي ما هو.
// مراجعة الصوت: النص اللي اتسمع لازم يطابق السكريبت ≥ 70% وإلا نعيد (مرة واحدة).
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync, spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import { keys as kaderKeys } from './ai.mjs';
const FF = fs.existsSync('/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg') ? '/opt/homebrew/opt/ffmpeg-full/bin/' : '';
const MODELS = (process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts,gemini-3.1-flash-tts-preview,gemini-2.5-flash-preview-tts').split(',');
const NOTES = 'Energetic Egyptian football presenter from Cairo, speaking Egyptian colloquial Arabic: punchy, excited but controlled, like a match-day sports show host; fast rhythm, strong emphasis on numbers and names; clear diction; never shouting. Continuous, breathless momentum like a viral sports short: NO pauses between sentences or paragraphs — flow straight from one line to the next.';
const keys = kaderKeys;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function wav(pcm, rate = 24000) { const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40); return Buffer.concat([h, pcm]); }

export class QuotaError extends Error {}
async function tts(text) {
  let last = ''; let daily = 0; let tries = 0;
  for (const model of MODELS) for (const k of keys()) {
    tries++;
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': k }, body: JSON.stringify({ contents: [{ parts: [{ text: `Read the TRANSCRIPT aloud exactly, word for word, in Egyptian Arabic. Speak nothing else.\n### DIRECTOR'S NOTES\n${NOTES}\n### TRANSCRIPT\n${text}` }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } } } } }), signal: AbortSignal.timeout(240000) }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: { message: e.message } }) }));
    const j = await r.json().catch(() => ({}));
    const p = j.candidates?.[0]?.content?.parts?.find((x) => x.inlineData)?.inlineData;
    if (r.ok && p) { const b = Buffer.from(p.data, 'base64'); return b.subarray(0, 4).toString('latin1') === 'RIFF' ? b : wav(b, Number(p.mimeType?.match(/rate=(\d+)/)?.[1] || 24000)); }
    last = `${model} ${r.status} ${(j.error?.message || '').slice(0, 160)}`;
    if (r.status === 429 && /day|daily|PerDay/i.test(last)) daily++;
    await sleep(r.status === 429 ? 6000 : 2000);
  }
  if (daily === tries) throw new QuotaError(`كوتة الصوت خلصت النهارده: ${last}`);
  throw new Error(`TTS فشل: ${last}`);
}

const norm = (s) => s.replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[^؀-ۿ0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
function similarity(a, b) { const A = norm(a), B = new Set(norm(b)); return A.filter((w) => B.has(w)).length / Math.max(1, A.length); }

/** الأوقات: faster-whisper (أو whisper-cli على الماك) → [{w,s,e}] */
function words(file) {
  const py = path.join(path.dirname(fileURLToPath(import.meta.url)), 'align.py');
  const out = execFileSync(process.env.PYTHON || 'python3', [py, file, 'ar'], { encoding: 'utf8', maxBuffer: 1 << 26, timeout: 900000 });
  const j = JSON.parse(out.trim().split('\n').pop()); if (j.error) throw new Error(j.error); return j;
}

// ===== شد الصوت (خطف المشاهد): بنشيل السكتات الحقيقية بس (ffmpeg silencedetect على الصوت نفسه، مش توقيت whisper)
// فعمرنا ما نقص كلام — كل سكتة أطول من KEEP بتتقصّر لـKEEP، وبعدين تسريع خفيف من غير ما الطبقة تتغير.
const KEEP = 0.08, TEMPO = 1.06;
function silences(file) {
  return spawnSync(`${FF}ffmpeg`, ['-nostdin', '-i', file, '-af', 'silencedetect=noise=-38dB:d=0.12', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 24 }).stderr || '';
}
export function tighten(full, sec) {
  const log = silences(full);
  const out = []; let st = null;
  for (const l of log.split('\n')) { const a = l.match(/silence_start: ([\d.]+)/); const b = l.match(/silence_end: ([\d.]+)/); if (a) st = Number(a[1]); if (b && st != null) { out.push([st, Number(b[1])]); st = null; } }
  if (st != null) out.push([st, sec]);
  // اللي هيتشال: نص السكتة ونسيب KEEP/2 من كل ناحية (والبداية من غير سكتة خالص)
  const cut = out.map(([a, b]) => (a <= 0.02 ? [0, Math.max(0, b - 0.03)] : [a + KEEP / 2, b - KEEP / 2])).filter(([a, b]) => b - a > 0.03);
  return cut;
}
export function mapper(cut) { return (t) => { let r = 0; for (const [a, b] of cut) { if (t >= b) r += b - a; else if (t > a) r += t - a; } return (t - r) / TEMPO; }; }
export function applyTighten(full, cut) {
  const tmp = full.replace(/\.wav$/, '.tight.wav');
  const sel = cut.length ? `aselect='not(${cut.map(([a, b]) => `between(t,${a.toFixed(3)},${b.toFixed(3)})`).join('+')})',asetpts=N/SR/TB,` : '';
  execFileSync(`${FF}ffmpeg`, ['-loglevel', 'error', '-y', '-i', full, '-af', `${sel}atempo=${TEMPO}`, tmp]);
  fs.copyFileSync(full, full.replace(/\.wav$/, '.raw.wav')); fs.renameSync(tmp, full);
}

/** يعمل voice/<id>.wav لكل سطر. يرجّع {transcript, similarity, seconds} */
export async function voice(dir, lines, log = console.log) {
  const vdir = path.join(dir, 'voice'); fs.mkdirSync(vdir, { recursive: true });
  const text = lines.map((l) => l.vo).join('\n\n'); const nWords = norm(text).length;
  for (let attempt = 0; attempt < 2; attempt++) {
    const full = path.join(vdir, 'full.wav'); fs.writeFileSync(full, await tts(text));
    let sec = Number(execFileSync(`${FF}ffprobe`, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', full], { encoding: 'utf8' }));
    if (sec > nWords * 0.62 + 4 || sec < nWords * 0.25) { log(`⟳ الصوت ${sec.toFixed(1)}ث مش مناسب لـ${nWords} كلمة — بنعيد`); continue; }
    const al = words(full); const heard = al.words.map((w) => w.w).join(' ');
    const sim = similarity(text, heard);
    if (sim < 0.7) { log(`⟳ الصوت قال كلام مختلف (تطابق ${(sim * 100).toFixed(0)}%) — بنعيد`); continue; }
    // تقسيم من غير تقطيع: نلاقي أول كلمة في كل سطر جوه كلام whisper (مطابقة)، ونقطع في السكتة اللي قبلها بالظبط
    const W = al.words; const ratio = W.length / nWords; let cum = 0; const cuts = [0]; let tight = 0;
    const H = W.map((w) => norm(w.w).join('')); const pre = (x) => (x || '').replace(/^(و|ف|ب|ل|ال|وال|بال|لل)(?=..)/, '').slice(0, 3);
    const same = (a, b) => !!a && !!b && (a === b || pre(a) === pre(b));
    let from = 1;
    for (let i = 0; i < lines.length - 1; i++) {
      cum += norm(lines[i].vo).length; const exp = Math.min(W.length - 1, Math.max(1, Math.round(cum * ratio)));
      const nx = norm(lines[i + 1].vo); let k = -1, score = -1;
      for (let j = Math.max(from, exp - 8); j <= Math.min(W.length - 1, exp + 8); j++) {
        const sc = (same(H[j], nx[0]) ? 2 : 0) + (same(H[j + 1], nx[1]) ? 1 : 0) + (same(H[j + 2], nx[2]) ? 1 : 0);
        const g = W[j].s - W[j - 1].e; const val = sc * 10 + Math.min(g, 0.6) * 5 - Math.abs(j - exp) * 0.3;
        if (sc >= 2 && val > score) { score = val; k = j; }
      }
      if (k < 0) { let gap = -1; for (let j = Math.max(from, exp - 5); j <= Math.min(W.length - 1, exp + 5); j++) { const g = W[j].s - W[j - 1].e; if (g > gap) { gap = g; k = j; } } }
      if (W[k].s - W[k - 1].e < 0.05) tight++;
      cuts.push((W[k - 1].e + W[k].s) / 2); from = k + 1;
    }
    cuts.push(sec);
    // شد الصوت: نشيل السكتات ونسرّع شوية، ونحوّل كل الأوقات للصوت الجديد
    const cut = tighten(full, sec); const m = mapper(cut); const before = sec;
    applyTighten(full, cut);
    for (let i = 0; i < cuts.length; i++) cuts[i] = m(cuts[i]);
    const lastEnd = m(W.at(-1).e);
    sec = Number(execFileSync(`${FF}ffprobe`, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', full], { encoding: 'utf8' }));
    cuts[cuts.length - 1] = sec;
    log(`⚡ شد الصوت: ${before.toFixed(1)}ث ← ${sec.toFixed(1)}ث (اتشال ${cut.length} سكتة)`);
    lines.forEach((l, i) => execFileSync(`${FF}ffmpeg`, ['-loglevel', 'error', '-y', '-i', full, '-ss', String(cuts[i]), '-to', String(cuts[i + 1]), path.join(vdir, `${l.id}.wav`)]));
    fs.writeFileSync(path.join(vdir, 'transcript.txt'), heard);
    // آخر وقفة بعد آخر كلمة + نص ثانية — والصوت الكامل هو اللي بيتحط في الفيديو (من غير تقطيع)
    fs.writeFileSync(path.join(vdir, 'cuts.json'), JSON.stringify({ cuts: [0, ...cuts.slice(1, -1), Math.min(sec, lastEnd + 0.25)] }));
    log(`✓ الصوت: ${sec.toFixed(1)}ث، تطابق ${(sim * 100).toFixed(0)}%`);
    return { transcript: heard, similarity: sim, seconds: sec };
  }
  throw new Error('الصوت ما عدّاش المراجعة بعد محاولتين');
}
