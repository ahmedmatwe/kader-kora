// Gemini: نص/JSON/صوت/رؤية. المفتاح GEMINI_API_KEY (على السحابة secret، على الماك من .env بتاع سر البراند).
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
export function key() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.split(',')[0].trim();
  const f = path.join(os.homedir(), 'Desktop/youtube-ai-studio/.env');
  const l = fs.existsSync(f) && fs.readFileSync(f, 'utf8').split('\n').find((x) => x.startsWith('GEMINI_API_KEY='));
  if (!l) throw new Error('مفيش GEMINI_API_KEY'); return l.slice(15).trim().replace(/^"|"$/g, '').split(',')[0];
}
const WRITE = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3-flash-preview'];
const LIGHT = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.5-flash'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(models, parts, gen) {
  let last = '';
  for (let pass = 0; pass < 2; pass++) for (const m of models) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key() }, body: JSON.stringify({ contents: [{ parts }], generationConfig: gen }), signal: AbortSignal.timeout(180000) }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: { message: e.message } }) }));
    const j = await r.json().catch(() => ({}));
    const p = j.candidates?.[0]?.content?.parts; if (r.ok && p) return p;
    last = `${m} ${r.status} ${(j.error?.message || '').slice(0, 120)}`; await sleep(r.status === 429 ? 8000 : 2000);
  }
  throw new Error(`Gemini فشل: ${last}`);
}
/** JSON مضمون (بيعيد لو الرد مش JSON) */
export async function json(prompt, { light = false, temp = 0.5 } = {}) {
  for (let i = 0; i < 3; i++) {
    const p = await call(light ? LIGHT : WRITE, [{ text: prompt }], { responseMimeType: 'application/json', temperature: temp });
    try { return JSON.parse(p.map((x) => x.text || '').join('')); } catch {}
  }
  throw new Error('Gemini ما رجّعش JSON سليم');
}
/** رؤية: صورة/صور + سؤال → JSON */
export async function vision(prompt, images) {
  const parts = [{ text: prompt }, ...images.map((f) => ({ inlineData: { mimeType: f.endsWith('.png') ? 'image/png' : 'image/jpeg', data: fs.readFileSync(f).toString('base64') } }))];
  const p = await call(WRITE, parts, { responseMimeType: 'application/json', temperature: 0.1 });
  return JSON.parse(p.map((x) => x.text || '').join(''));
}
/** تفريغ صوت (مراجعة إن الصوت قال النص بالظبط) */
export async function transcribe(wav) {
  const p = await call(WRITE, [{ text: 'Transcribe this Egyptian Arabic audio exactly, word for word. Return JSON {"text": "..."}' }, { inlineData: { mimeType: 'audio/wav', data: fs.readFileSync(wav).toString('base64') } }], { responseMimeType: 'application/json', temperature: 0 });
  return JSON.parse(p.map((x) => x.text || '').join('')).text || '';
}
