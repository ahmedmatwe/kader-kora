// Gemini: نص/JSON/صوت/رؤية. المفاتيح: GEMINI_API_KEY (على السحابة secret، مفصولة بفاصلة) أو ~/.kader-kora/gemini على الماك.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
// مفاتيح كادر كورة بس (2-3 مفاتيح من مشاريع Google مختلفة = كوتة أكبر). ممنوع مفتاح سر الموبايل.
export function keys() {
  const own = path.join(os.homedir(), '.kader-kora/gemini');
  const raw = process.env.GEMINI_API_KEY || (fs.existsSync(own) ? fs.readFileSync(own, 'utf8') : '');
  const list = raw.split(/[,\s]+/).map((k) => k.trim()).filter((k) => /^(AIza|AQ\.)/.test(k) && k.length > 30);
  if (!list.length) throw new Error('مفيش مفتاح Gemini لكادر كورة — شغّل scripts/connect-gemini.sh');
  return list;
}
export const key = () => keys()[0];
// آخر القايمة موديلات خفيفة: لو كوتة اليوم خلصت على الكبار الإنتاج ما يقفش (المراجعين ومراجعة الجودة بيفحصوا زي ما هم)
const WRITE = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3-flash-preview', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest'];
const LIGHT = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.5-flash'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(models, parts, gen) {
  let last = '';
  for (let pass = 0; pass < 4; pass++) { if (pass && /429/.test(last)) await sleep(45000); // حد الدقيقة: نستنى ونرجع بدل ما الفيديو يقع
  for (const m of models) for (const k of keys()) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': k }, body: JSON.stringify({ contents: [{ parts }], generationConfig: gen }), signal: AbortSignal.timeout(90000) }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: { message: e.message } }) }));
    const j = await r.json().catch(() => ({}));
    const p = j.candidates?.[0]?.content?.parts; if (r.ok && p) return p;
    last = `${m} ${r.status} ${(j.error?.message || '').slice(0, 120)}`; await sleep(r.status === 429 ? 1500 : 2000);
  } }
  throw new Error(`Gemini فشل: ${last}`);
}
/** JSON مضمون (بيعيد لو الرد مش JSON) */
export async function json(prompt, { light = false, temp = 0.5, fast = false } = {}) {
  for (let i = 0; i < 3; i++) {
    const p = await call(light ? LIGHT : WRITE, [{ text: prompt }], { responseMimeType: 'application/json', temperature: temp, ...(fast || light ? { thinkingConfig: { thinkingLevel: 'minimal' } } : {}) });
    try { return JSON.parse(p.map((x) => x.text || '').join('')); } catch {}
  }
  throw new Error('Gemini ما رجّعش JSON سليم');
}
/** رؤية: صورة/صور + سؤال → JSON */
export async function vision(prompt, images) {
  const parts = [{ text: prompt }, ...images.map((f) => ({ inlineData: { mimeType: f.endsWith('.png') ? 'image/png' : 'image/jpeg', data: fs.readFileSync(f).toString('base64') } }))];
  const p = await call(LIGHT, parts, { responseMimeType: 'application/json', temperature: 0.1, thinkingConfig: { thinkingLevel: 'minimal' } });
  return JSON.parse(p.map((x) => x.text || '').join(''));
}
/** تفريغ صوت (مراجعة إن الصوت قال النص بالظبط) */
export async function transcribe(wav) {
  const p = await call(WRITE, [{ text: 'Transcribe this Egyptian Arabic audio exactly, word for word. Return JSON {"text": "..."}' }, { inlineData: { mimeType: 'audio/wav', data: fs.readFileSync(wav).toString('base64') } }], { responseMimeType: 'application/json', temperature: 0 });
  return JSON.parse(p.map((x) => x.text || '').join('')).text || '';
}
