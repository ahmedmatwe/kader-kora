// فريق الردود (على السحابة): بيجيب الكومنتات الجديدة على منشوراتنا (يوتيوب/فيس/إنستا)، يصنّفها، ويرد بالمصري بأدب.
// القواعد: ما نردش على شتيمة/سياسة/دين/طائفية/اتهامات/سبام (بتتسجل «تجاهل» بس)، ما نخترعش معلومة — الرد من ملف المصادر بتاع الفيديو،
// وفي الأرقام المختلف عليها بنقول إن فيه أكتر من حسبة. حد أقصى 25 رد في الدورة. كل حاجة بتتسجل في data/comments.json.
// DRY=1 → يجهّز الردود ويطبعها من غير ما ينشر.
import fs from 'node:fs'; import path from 'node:path';
import { ROOT, readJson, writeJson, posts, googleAccess } from './lib.mjs';
import { metaCreds, guard } from './meta.mjs';
const DRY = !!process.env.DRY; const MAX = 25; const LOG = path.join(ROOT, 'data/comments.json');
const log = readJson(LOG, { seen: {}, items: [] });
const KEY = process.env.GEMINI_API_KEY; const MODELS = ['gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.5-flash-lite'];

export async function gemini(prompt) {
  for (const m of MODELS) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.4 } }) });
    const j = await r.json().catch(() => ({})); const t = j.candidates?.[0]?.content?.parts?.[0]?.text;
    if (t) try { return JSON.parse(t); } catch {}
  }
  return null;
}
export const RULES = `إنت مسؤول الردود في قناة «كادر كورة» (تريندات كورة مصرية). اكتب بالمصري، قصير (سطر أو اتنين)، محترم ودود، من غير إيموجي كتير.
- لو الكومنت شتيمة، أو سياسة، أو دين، أو طائفية، أو اتهام لحد، أو تنمر، أو سبام/لينكات، أو بيطلب بيانات شخصية → action="ignore".
- لو سؤال عن معلومة: جاوب من «حقائق الفيديو» بس، واذكر المصدر لو مفيد. لو المعلومة مش موجودة قول إنك هتتابع الموضوع، وما تخترعش.
- لو اختلاف في الرأي أو الأرقام: احترم رأيه، ووضّح إن فيه أكتر من حسبة من غير ما تنحاز.
- لو مدح أو تفاعل عادي: اشكره ورد بسؤال خفيف يكمّل النقاش.
- ممنوع تعد بحاجة، أو تهاجم حد، أو تقول رأي في لاعب أو مدرب بشكل مسيء.
رجّع JSON: {"action":"reply"|"ignore","category":"question|praise|disagree|abuse|politics|spam|other","reply":"..."}`;

export async function facts(video) { const f = path.join(ROOT, 'videos', video, 'sources.md'); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').slice(0, 3500) : ''; }

async function youtubeComments(p, H) {
  const j = await (await fetch(`https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${p.id}&maxResults=50&order=time`, { headers: H })).json();
  return (j.items || []).filter((t) => !t.snippet.totalReplyCount).map((t) => ({ id: t.id, text: t.snippet.topLevelComment.snippet.textOriginal, author: t.snippet.topLevelComment.snippet.authorDisplayName, mine: t.snippet.topLevelComment.snippet.authorChannelId?.value === t.snippet.channelId }));
}
async function youtubeReply(id, text, H) {
  const r = await fetch('https://www.googleapis.com/youtube/v3/comments?part=snippet', { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ snippet: { parentId: id, textOriginal: text } }) });
  if (!r.ok) throw new Error(`YT reply ${r.status}`);
}
async function metaGraph(c, p, params = {}, method = 'GET') {
  const body = new URLSearchParams({ ...params, access_token: c.token }); const url = `https://graph.facebook.com/v27.0/${p}`;
  const r = method === 'GET' ? await fetch(`${url}?${body}`) : await fetch(url, { method, body }); const j = await r.json(); if (j.error) throw new Error(j.error.message); return j;
}
async function metaComments(p, c) {
  if (p.platform === 'instagram') {
    const j = await metaGraph(c, `${p.id}/comments`, { fields: 'id,text,username,replies{username}', limit: '50' });
    const me = (await metaGraph(c, c.igId, { fields: 'username' })).username;
    return (j.data || []).filter((x) => x.username !== me && !(x.replies?.data || []).some((r) => r.username === me)).map((x) => ({ id: x.id, text: x.text, author: x.username }));
  }
  const j = await metaGraph(c, `${p.id}/comments`, { fields: 'id,message,from,comments{from}', limit: '50' });
  return (j.data || []).filter((x) => x.from?.id !== c.pageId && !(x.comments?.data || []).some((r) => r.from?.id === c.pageId)).map((x) => ({ id: x.id, text: x.message, author: x.from?.name || '' }));
}
async function metaReply(p, id, text, c) { await metaGraph(c, p.platform === 'instagram' ? `${id}/replies` : `${id}/comments`, { message: text }, 'POST'); }

import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
async function main() {
if (!KEY) { console.log('ℹ️ مفيش GEMINI_API_KEY — فريق الردود متوقف'); return; }
let H = null; try { H = { authorization: `Bearer ${await googleAccess()}` }; } catch {}
let meta = null; try { meta = metaCreds(); await guard(meta); } catch (e) { if (meta) console.error(e.message); meta = null; }
let replied = 0;
for (const p of posts().filter((x) => x.status !== 'private' || new Date(x.publishAt) < new Date())) {
  let list = [];
  try { list = p.platform === 'youtube' ? (H ? await youtubeComments(p, H) : []) : meta ? await metaComments(p, meta) : []; } catch (e) { console.error(`✗ ${p.platform}/${p.id}:`, e.message); continue; }
  const f = await facts(p.video);
  for (const c of list) {
    if (c.mine || log.seen[c.id] || replied >= MAX) continue;
    const d = await gemini(`${RULES}\n\nعنوان الفيديو: ${p.title}\nحقائق الفيديو:\n${f}\n\nالكومنت (${p.platform}) من ${c.author}:\n«${c.text}»`);
    if (!d) continue;
    const item = { platform: p.platform, post: p.id, comment: c.id, author: c.author, text: c.text, ...d, at: new Date().toISOString() };
    if (d.action === 'reply' && d.reply?.trim()) {
      if (DRY) item.dry = true;
      else try { p.platform === 'youtube' ? await youtubeReply(c.id, d.reply, H) : await metaReply(p, c.id, d.reply, meta); replied++; } catch (e) { item.error = e.message; }
    }
    log.seen[c.id] = 1; log.items.push(item); console.log(`${d.action === 'reply' ? '↩︎' : '⊘'} [${p.platform}] ${c.text.slice(0, 50)} → ${d.reply || d.category}`);
  }
}
if (!DRY) writeJson(LOG, log);
console.log(`ردود: ${replied}${DRY ? ' (تجربة من غير نشر)' : ''}`);
}
