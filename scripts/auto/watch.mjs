// 🛡️ فريق متابعة النفي: كل 10 دقايق بيراجع كل خبر عملناه آخر 3 أيام في الجرايد الكبيرة.
// لو الخبر اتنفى رسميًا: يلغي اللي لسه ما اتنشرش (ومنه ميعاد يوتيوب المجدول) + يطلب فيديو نفي/تصحيح من المصنع على طول.
// كتاب الخبرة بتاعه: DENIAL_PLAYBOOK.md (بيتقري ويدخل في كل حكم). node scripts/auto/watch.mjs [--dry]
import fs from 'node:fs'; import path from 'node:path';
import { ROOT, readJson, writeJson, googleAccess } from '../lib.mjs';
import { search, article } from './news.mjs';
import { overlap, verify } from './pick.mjs';
import { json } from './ai.mjs';
import { tell } from './notify.mjs';
const DRY = process.argv.includes('--dry');
const PLAYBOOK = fs.readFileSync(path.join(ROOT, 'DENIAL_PLAYBOOK.md'), 'utf8');
const WF = path.join(ROOT, 'data/watch.json'); const W = readJson(WF, { items: {}, runs: [] });
const REQF = path.join(ROOT, 'data/requests.json'); const requests = readJson(REQF, []);
const DENY = /نفي|نفى|ينفي|ينفى|تنفي|تنفى|نافي|يكذب|تكذيب|كذّب|كذب|غير صحيح|غير حقيقي|عار[يٍ]? (تمام[اًا] )?من الصحة|لا أساس|شائع|مفبرك|مزيف|مزيّف|حقيقة|توضيح|يوضح|توضح|تصحيح|بيان رسمي|بيان|يرد على|ترد على|رد رسمي|اعتذار|تراجع|ليس صحيح|مش صحيح|خبر كاذب|أخبار كاذبة/;
const log = (s) => console.log(s);
const changed = new Set();

// اللي بنتابعه: كل تذكرة اتعملت آخر 72 ساعة (ومش فيديو نفي هي نفسها)
const qdir = path.join(ROOT, 'queue');
const tickets = fs.readdirSync(qdir).filter((f) => f.endsWith('.json')).map((f) => ({ f, t: readJson(path.join(qdir, f)) }))
  .filter(({ t }) => t.kind !== 'denial' && Date.now() - new Date(t.createdAt) < 72 * 3600e3);
log(`🛡️ بتابع ${tickets.length} خبر`);

const isOut = (p, j) => j.status === 'published' || (p === 'youtube' && j.status === 'scheduled' && new Date(j.at) <= new Date());
async function ytPrivate(url) { // يوتيوب المجدول: يرجع خاص ومن غير ميعاد نشر = ما ينزلش
  const id = (url || '').split('/').pop(); if (!id) return false;
  const tok = await googleAccess();
  const r = await fetch('https://www.googleapis.com/youtube/v3/videos?part=status', { method: 'PUT', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, body: JSON.stringify({ id, status: { privacyStatus: 'private', selfDeclaredMadeForKids: false } }) });
  return r.ok;
}

for (const { f, t } of tickets) {
  const st = W.items[t.id] ||= { state: 'clear', checks: 0 };
  if (st.state === 'denied' && st.requested) continue;
  const story = readJson(path.join(ROOT, 'videos', t.id, 'story.json'), null);
  if (!story?.facts) { log(`⊘ ${t.id}: مفيش story.json`); continue; }
  const srcAt = (story.sources || []).map((x) => Date.parse(x.date)).filter(Boolean); // من أول ما الخبر الأصلي اتنشر (مش من ميعاد فيديونا)
  const since = (srcAt.length ? Math.min(...srcAt) : new Date(t.createdAt).getTime() - 24 * 3600e3) - 3600e3;
  const names = (story.people || []).map((p) => p.ar).filter(Boolean).slice(0, 3);
  const short = story.topic.split(/\s+/).slice(0, 6).join(' ');
  const qs = [`${short} نفي`, `حقيقة ${short}`, ...names.map((n) => `${n} ينفي`), ...names.map((n) => `${n} حقيقة`)];
  const hits = []; const seen = new Set();
  for (const q of qs) for (const h of await search(q, 3)) {
    if (seen.has(h.url) || (h.at && h.at < since)) continue; seen.add(h.url);
    const txt = `${h.title} ${h.snippet}`;
    const about = overlap(h.title, story.topic) >= 0.25 || names.some((n) => txt.includes(n.split(' ').at(-1)));
    if (about && DENY.test(txt)) hits.push(h);
  }
  st.checks++; st.lastCheck = new Date().toISOString();
  if (!hits.length) { log(`✓ ${t.id}: مفيش نفي`); continue; }
  // اقرا أقوى 4 مقالات واحكم (كتاب الخبرة جوه الحكم)
  const arts = [];
  for (const h of hits.slice(0, 4)) { const a = await article(h.url); arts.push({ ...h, text: a.text.slice(0, 1800) }); }
  const facts = story.facts.map((x, i) => `[F${i + 1}] ${x.fact || x}`).join('\n');
  const j = await json(`${PLAYBOOK}

—— الشغل دلوقتي ——
الخبر اللي إحنا نشرناه/هننشره («${story.topic}») اتبنى على الحقايق دي:
${facts}
مصادرنا الأصلية اتنشرت: ${(story.sources || []).map((x) => `${x.paper} ${x.date || '?'}`).join('، ')}. فيديونا اتعمل ${t.createdAt}. ده اللي ظهر في الجرايد الكبيرة من بعد الخبر الأصلي:
${arts.map((a, i) => `### [${i}] ${a.paper} — ${a.title} (${a.at ? new Date(a.at).toISOString() : 'تاريخ مش واضح'})\n${a.snippet}\n${a.text}`).join('\n\n')}

احكم حسب كتاب الخبرة. رجّع JSON {"denied":true|false,"level":"official|correction|none","facts":["F1"],"denier":"مين نفى (الجهة/الشخص)","papers":["الجرايد اللي نشرت النفي"],"ids":[أرقام المقالات اللي فيها النفي],"summary":"النفي في سطر بالعامية","why":"ليه حكمت كده"}`, { temp: 0 });
  const ok = j.denied && ['official', 'correction'].includes(j.level) && (j.facts || []).length;
  if (!ok) { log(`✓ ${t.id}: فيه كلام بس مش نفي لخبرنا (${(j.why || '').slice(0, 120)})`); st.lastNote = j.why; changed.add(WF); continue; }
  const papers = [...new Set((j.ids || []).map((i) => arts[i]?.paper).filter(Boolean))];
  log(`🚨 ${t.id}: اتنفى — ${j.summary} (${j.denier} · ${papers.join('، ')})`);
  const first = st.state !== 'denied';
  Object.assign(st, { state: 'denied', at: st.at || new Date().toISOString(), summary: j.summary, denier: j.denier, facts: j.facts, papers, why: j.why });

  // 1) إلغاء اللي لسه ما نزلش
  const cancelled = []; const live = [];
  for (const [p, job] of Object.entries(t.platforms || {})) {
    if (isOut(p, job)) { live.push(`${p}: ${job.url || ''}`); continue; }
    if (job.status === 'cancelled') continue;
    if (p === 'youtube' && job.status === 'scheduled' && !DRY) { if (!(await ytPrivate(job.url).catch(() => false))) { log(`⚠️ ${t.id}/youtube: ما قدرتش أوقف الميعاد`); continue; } }
    if (!DRY) Object.assign(job, { status: 'cancelled', why: `نفي: ${j.summary}`, cancelledAt: new Date().toISOString() });
    cancelled.push(p);
  }
  if (cancelled.length && !DRY) { t.denied = { at: st.at, summary: j.summary, denier: j.denier }; writeJson(path.join(qdir, f), t); changed.add('queue'); }

  // 2) فيديو النفي: لازم النفي نفسه يتأكد من جريدتين كبار (نفس قاعدة القناة)
  let reqd = false;
  const src = [...new Map((j.ids || []).map((i) => arts[i]).filter(Boolean).map((a) => [a.paper, a])).values()];
  if (src.length >= 2) {
    const v = await verify({ topic: `نفي رسمي: ${j.summary} (تصحيح لخبر «${story.topic}»)`, slug: `denial-${story.slug || 'news'}`.slice(0, 30), type: 'news' }, src, log, []).catch((e) => (log(`⊘ التحقق: ${e.message}`), null));
    if (v && !DRY) {
      requests.push({ at: new Date().toISOString(), kind: 'denial', corrects: t.id, wasLive: live.length > 0, text: v.topic, story: { ...v, people: story.people, denial: { original: story.topic, summary: j.summary, denier: j.denier, wasLive: live.length > 0 } }, status: 'pending' });
      writeJson(REQF, requests); changed.add(REQF); st.requested = true; reqd = true;
    }
  } else log(`⏳ ${t.id}: النفي في جريدة واحدة بس (${papers.join('، ')}) — لغيت اللي ما نزلش، وفيديو النفي لما جريدة تانية تأكد`);
  changed.add(WF);
  if (first || reqd) await tell(`🚨 فريق متابعة النفي: خبر اتنفى\n«${story.topic}»\n\nالنفي: ${j.summary}\nمين: ${j.denier} · ${papers.join('، ')}\n\n${cancelled.length ? `⛔ لغيت النشر على: ${cancelled.join('، ')}\n` : ''}${live.length ? `📢 كان نزل على: ${live.map((x) => x.split(':')[0]).join('، ')}\n` : ''}${reqd ? '🎬 بعمل فيديو النفي دلوقتي وهينزل على طول' : '⏳ فيديو النفي أول ما جريدة كبيرة تانية تأكد'}`);
}
W.runs = [...W.runs, { at: new Date().toISOString(), watched: tickets.length }].slice(-50);
if (!DRY) writeJson(WF, W);
const dispatch = requests.some((r) => r.kind === 'denial' && r.status === 'pending');
fs.writeFileSync('/tmp/watch-dispatch', dispatch ? 'yes' : 'no');
log(dispatch ? '🎬 فيه فيديو نفي مستني المصنع' : '— خلصت المتابعة');
