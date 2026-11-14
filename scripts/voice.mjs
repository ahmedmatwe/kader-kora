// تعليق صوتي سطر بسطر بـGemini TTS . node scripts/voice.mjs videos/01-x
// بيطلع: voice/<id>.wav لكل سطر + voice/timing.json (مدة كل سطر)
import fs from 'node:fs'; import path from 'node:path';
import { keys as kaderKeys } from './auto/ai.mjs';
const keys = kaderKeys();
const models = (process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts,gemini-3.1-flash-tts-preview,gemini-2.5-flash-preview-tts').split(',');
const voiceName = process.env.VOICE || 'Fenrir';
const dir = process.argv[2]; const out = process.env.OUT || path.join(dir, 'voice'); fs.mkdirSync(out, { recursive: true });
const { lines } = JSON.parse(fs.readFileSync(path.join(dir, 'script.json'), 'utf8'));
const NOTES = process.env.NOTES || 'Energetic Egyptian football presenter from Cairo, speaking Egyptian colloquial Arabic: punchy, excited but controlled, like a match-day sports show host; fast rhythm, strong emphasis on numbers and names; clear diction; never shouting.';
const prompt = (t) => `Read the TRANSCRIPT aloud exactly, word for word, in Egyptian Arabic. Speak nothing else.\n### DIRECTOR'S NOTES\n${NOTES}\n### TRANSCRIPT\n${t}`;
function wav(pcm, rate = 24000) { const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40); return Buffer.concat([h, pcm]); }
async function tts(text) {
  let last = '';
  for (const model of models) for (const key of keys) for (let a = 0; a < 2; a++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt(text) }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } } }) });
    const j = await r.json().catch(() => ({}));
    const p = j.candidates?.[0]?.content?.parts?.find((x) => x.inlineData)?.inlineData;
    if (r.ok && p) { const b = Buffer.from(p.data, 'base64'); return b.subarray(0, 4).toString('latin1') === 'RIFF' ? b : wav(b, Number(p.mimeType?.match(/rate=(\d+)/)?.[1] || 24000)); }
    last = `${model} ${r.status} ${(j.error?.message || '').slice(0, 120)}`; console.error('retry:', last);
    if (r.status === 429 && /day/i.test(last)) break;
    await new Promise((s) => setTimeout(s, 8000));
  }
  throw new Error(last);
}
const only = process.argv[3];
for (const l of lines) {
  if (only && l.id !== only) continue;
  const f = path.join(out, `${l.id}.wav`);
  // حارس: Gemini أحيانًا بيرجّع صوت مكرر أو كلام مش موجود (اتمسك مرتين). المدة لازم تناسب عدد الكلمات وإلا نعيد.
  const words = l.vo.split(/\s+/).length; let ok = false;
  for (let a = 0; a < 4 && !ok; a++) {
    const w = await tts(l.vo); const sec = (w.length - 44) / (w.readUInt32LE(28) || 48000);
    if (sec > words * 0.62 + 1.5 || sec < words * 0.25) { console.error(`⟳ ${l.id}: ${sec.toFixed(1)}ث مش مناسبة لـ${words} كلمة — بنعيد`); continue; }
    fs.writeFileSync(f, w); ok = true; console.log('✓', l.id, sec.toFixed(1) + 'ث');
  }
  if (!ok) console.error(`✗ ${l.id}: ما طلعش تسجيل سليم بعد 4 محاولات`);
}
