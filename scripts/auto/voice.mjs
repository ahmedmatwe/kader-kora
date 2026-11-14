// فريق الصوت: طلب TTS واحد للسكريبت كله (توفير الكوتة: ~10 طلبات/يوم لكل مفتاح) بصوت Fenrir،
// بعدين faster-whisper يطلّع وقت كل كلمة → نقسم الصوت لسطور (voice/<id>.wav) → build_plan يكمل زي ما هو.
// مراجعة الصوت: النص اللي اتسمع لازم يطابق السكريبت ≥ 70% وإلا نعيد (مرة واحدة).
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
import { keys as kaderKeys } from './ai.mjs';
const FF = fs.existsSync('/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg') ? '/opt/homebrew/opt/ffmpeg-full/bin/' : '';
const MODELS = (process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts,gemini-3.1-flash-tts-preview,gemini-2.5-flash-preview-tts').split(',');
const NOTES = 'Energetic Egyptian football presenter from Cairo, speaking Egyptian colloquial Arabic: punchy, excited but controlled, like a match-day sports show host; fast rhythm, strong emphasis on numbers and names; clear diction; never shouting. Leave a short natural pause between paragraphs.';
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
  const py = path.join(path.dirname(new URL(import.meta.url).pathname), 'align.py');
  const out = execFileSync(process.env.PYTHON || 'python3', [py, file, 'ar'], { encoding: 'utf8', maxBuffer: 1 << 26, timeout: 900000 });
  const j = JSON.parse(out.trim().split('\n').pop()); if (j.error) throw new Error(j.error); return j;
}

/** يعمل voice/<id>.wav لكل سطر. يرجّع {transcript, similarity, seconds} */
export async function voice(dir, lines, log = console.log) {
  const vdir = path.join(dir, 'voice'); fs.mkdirSync(vdir, { recursive: true });
  const text = lines.map((l) => l.vo).join('\n\n'); const nWords = norm(text).length;
  for (let attempt = 0; attempt < 2; attempt++) {
    const full = path.join(vdir, 'full.wav'); fs.writeFileSync(full, await tts(text));
    const sec = Number(execFileSync(`${FF}ffprobe`, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', full], { encoding: 'utf8' }));
    if (sec > nWords * 0.62 + 4 || sec < nWords * 0.25) { log(`⟳ الصوت ${sec.toFixed(1)}ث مش مناسب لـ${nWords} كلمة — بنعيد`); continue; }
    const al = words(full); const heard = al.words.map((w) => w.w).join(' ');
    const sim = similarity(text, heard);
    if (sim < 0.7) { log(`⟳ الصوت قال كلام مختلف (تطابق ${(sim * 100).toFixed(0)}%) — بنعيد`); continue; }
    // تقسيم: حدود السطور بنسبة عدد الكلمات، وبعدين أكبر سكتة قريبة (±3 كلمات)
    const W = al.words; const ratio = W.length / nWords; let cum = 0; const cuts = [0];
    for (const l of lines.slice(0, -1)) {
      cum += norm(l.vo).length; let k = Math.min(W.length - 1, Math.max(1, Math.round(cum * ratio)));
      let best = k, gap = -1; for (let j = Math.max(1, k - 3); j <= Math.min(W.length - 1, k + 3); j++) { const g = W[j].s - W[j - 1].e; if (g > gap) { gap = g; best = j; } }
      cuts.push((W[best - 1].e + W[best].s) / 2);
    }
    cuts.push(sec);
    lines.forEach((l, i) => execFileSync(`${FF}ffmpeg`, ['-loglevel', 'error', '-y', '-i', full, '-ss', String(cuts[i]), '-to', String(cuts[i + 1]), path.join(vdir, `${l.id}.wav`)]));
    fs.writeFileSync(path.join(vdir, 'transcript.txt'), heard);
    log(`✓ الصوت: ${sec.toFixed(1)}ث، تطابق ${(sim * 100).toFixed(0)}%`);
    return { transcript: heard, similarity: sim, seconds: sec };
  }
  throw new Error('الصوت ما عدّاش المراجعة بعد محاولتين');
}
