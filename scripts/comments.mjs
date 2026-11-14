// فريق الردود (على السحابة): بيجيب الكومنتات الجديدة على منشوراتنا (يوتيوب/فيس/إنستا)، يصنّفها، ويرد بالمصري بأدب.
// القواعد: ما نردش على شتيمة/سياسة/دين/طائفية/اتهامات/سبام (بتتسجل «تجاهل» بس)، ما نخترعش معلومة — الرد من ملف المصادر بتاع الفيديو،
// وفي الأرقام المختلف عليها بنقول إن فيه أكتر من حسبة. حد أقصى 25 رد في الدورة. كل حاجة بتتسجل في data/comments.json.
// DRY=1 → يجهّز الردود ويطبعها من غير ما ينشر.
import fs from 'node:fs'; import path from 'node:path';
import { ROOT, readJson, writeJson, posts, googleAccess } from './lib.mjs';
import { metaCreds, guard } from './meta.mjs';
const DRY = !!process.env.DRY; const MAX = 25; const LOG = path.join(ROOT, 'data/comments.json');
const log = readJson(LOG, { seen: {}, items: [] });
import { json } from './auto/ai.mjs';
// Gemini عن طريق ai.mjs: المفتاح من secret على السحابة أو .env على الماك + تبديل الموديلات لو واحد وقع
export async function gemini(prompt) { try { return await json(prompt, { light: true, temp: 0.4 }); } catch { return null; } }

export const RULES = `إنت مسؤول الردود في قناة «كادر كورة» (تريندات كورة مصرية).
الأسلوب (أهم حاجة):
- اكتب بالعامية المصرية بس (زي «تسلم يا غالي»، «عندك حق والله»، «منوّرنا»)، مش فصحى ومش لهجة تانية.
- بكل لطف وود واحترام، كأنك بترد على صاحبك. سطر أو اتنين بالكتير، وإيموجي واحد بالكتير.
- ممنوع نهائيًا: أي لفظ خارج أو شتيمة أو كلمة قليلة الذوق، تريقة أو سخرية، تقليل من حد، رد عصبي، أو «ردح» حتى لو الكومنت مستفز.
- خاطب الشخص باحترام («يا غالي»، «يا صديقي»، «يا كابتن») ومن غير ما تفترض إذا كان راجل ولا ست لو مش واضح.
إمتى ترد وإمتى تتجاهل:
- لو الكومنت شتيمة، أو سياسة، أو دين، أو طائفية، أو اتهام لحد، أو تنمر، أو سبام/لينكات، أو بيطلب بيانات شخصية → action="ignore" (ما تردش خالص، أحسن من أي رد).
- لو سؤال عن معلومة: جاوب من «حقائق الفيديو» بس. لو المعلومة مش موجودة قول بلطف إنك هتتابع الموضوع، وما تخترعش.
- لو اختلاف في الرأي أو الأرقام: احترم رأيه واشكره، ووضّح بهدوء إن فيه أكتر من حسبة من غير ما تنحاز.
- لو مدح أو تفاعل عادي: اشكره بود ورد بسؤال خفيف يكمّل النقاش.
- لو اقتراح أو ملاحظة (موضوع، صوت، شكل): اشكره وقول إنها فكرة حلوة وهتوصل للفريق — من غير «أكيد» ولا «هنعمل» ولا مواعيد.
- ممنوع تعد بحاجة، أو تهاجم حد، أو تقول رأي مسيء في لاعب أو مدرب أو نادي أو جمهور.
رجّع JSON: {"action":"reply"|"ignore","category":"question|praise|disagree|abuse|politics|spam|other","reply":"..."}`;

// حارس آلي بعد الموديل: أي رد فيه لفظ خارج/تريقة/لينك أو طويل → ما يتبعتش
const RUDE = /(يا\s*(حمار|غبي|عبيط|اهبل|أهبل|جزمة|متخلف|حيوان|كلب|واطي|بيئة)|غبي|غباء|عبيط|متخلف|تافه|فاشل|اخرس|إخرس|اسكت|حقير|وسخ|زبالة|قرف|ياض|يا\s*ابن|ابن\s*ال|كس|طيز|شرموط|منيك|خول|عرص|لعنة|ههههه+|🤣|😂{2,}|🖕|https?:|www\.|@\w)/i;
export function safeReply(t) {
  t = (t || '').trim();
  if (t.length < 2 || t.length > 220 || RUDE.test(t)) return '';
  return t;
}

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
    if (d.action === 'reply' && !safeReply(d.reply)) { item.blocked = 'safety'; d.action = 'ignore'; }
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
