// 🛡️ فريق متابعة النفي: شغال على طول (جولة كل 3 دقايق) بيراجع كل خبر عملناه آخر 3 أيام في الجرايد الكبيرة.
// لو الخبر اتنفى رسميًا: يلغي اللي لسه ما اتنشرش (ومنه ميعاد يوتيوب المجدول) + يطلب فيديو نفي/تصحيح من المصنع على طول.
// كتاب الخبرة بتاعه: DENIAL_PLAYBOOK.md (بيتقري ويدخل في كل حكم). node scripts/auto/watch.mjs [--dry]
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { ROOT, DATA_DIR, readJson, writeJson, googleAccess } from '../lib.mjs';
import { search, article } from './news.mjs';
import { overlap, verify } from './pick.mjs';
import { json } from './ai.mjs';
import { tell } from './notify.mjs';
import { persist } from '../guard.mjs';
import { execFileSync } from 'node:child_process';
const DRY = process.argv.includes('--dry');
const PLAYBOOK = fs.readFileSync(path.join(ROOT, 'DENIAL_PLAYBOOK.md'), 'utf8');
const WF = path.join(ROOT, 'data/watch.json'); const W = readJson(WF, { items: {}, runs: [] });
const REQF = path.join(ROOT, 'data/requests.json'); const requests = readJson(REQF, []);
const DENY = /نفي|نفى|ينفي|ينفى|تنفي|تنفى|نافي|يكذب|تكذيب|كذّب|كذب|غير صحيح|غير حقيقي|عار[يٍ]? (تمام[اًا] )?من الصحة|لا أساس|شائع|مفبرك|مزيف|مزيّف|حقيقة|توضيح|يوضح|توضح|تصحيح|بيان رسمي|بيان|يرد على|ترد على|رد رسمي|اعتذار|يصدم|يحسم|حسم الجدل|تعديل|يعدل|عدّل|تراجع|ليس صحيح|مش صحيح|خبر كاذب|أخبار كاذبة/;
const log = (s) => console.log(s);
const changed = new Set();

// اللي بنتابعه: كل تذكرة اتعملت آخر 72 ساعة (ومش فيديو نفي هي نفسها)
const qdir = path.join(ROOT, 'queue');
let tickets = fs.readdirSync(qdir).filter((f) => f.endsWith('.json')).map((f) => ({ f, t: readJson(path.join(qdir, f)) }))
  .filter(({ t }) => t.kind !== 'denial' && Date.now() - new Date(t.createdAt) < 72 * 3600e3);

const isOut = (p, j) => j.status === 'published' || (p === 'youtube' && j.status === 'scheduled' && new Date(j.at) <= new Date());
async function ytPrivate(url) { // يوتيوب المجدول: يرجع خاص ومن غير ميعاد نشر = ما ينزلش
  const id = (url || '').split('/').pop(); if (!id) return false;
  const tok = await googleAccess();
  const r = await fetch('https://www.googleapis.com/youtube/v3/videos?part=status', { method: 'PUT', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, body: JSON.stringify({ id, status: { privacyStatus: 'private', selfDeclaredMadeForKids: false } }) });
  return r.ok;
}

/** قلب الفريق: هل حقايق الخبر ده اتنفت/اتصححت رسميًا؟ بيستخدمه المراقب كل 10 دقايق + المصنع قبل الطابور */
export async function denialCheck(story, refAt = Date.now(), lg = log, memo = null) {
  // النافذة: من 3 أيام قبل فيديونا — التصحيح الرسمي ممكن يكون نزل قبل مصادرنا نفسها (درس صلاح 70/68)
  const since = new Date(refAt).getTime() - 72 * 3600e3;
  const names = (story.people || []).map((p) => p.ar).filter(Boolean).slice(0, 3);
  const short = story.topic.split(/\s+/).slice(0, 6).join(' ');
  const facts = (story.facts || []).map((x, i) => `[F${i + 1}] ${x.fact || x}`).join('\n');
  // أسئلة البحث بالحقيقة نفسها (الجهة الرسمية + الرقم)، مش بكلمات عامة بس
  const ai = memo?.qs ? { q: memo.qs } : await json(`${facts}\nاكتب 6 جمل بحث قصيرة (3-5 كلمات) بالعربي، كل واحدة ممكن تلاقي خبر **نفي أو تصحيح رسمي** لحقيقة من دول: اذكر الجهة اللي ممكن تصحح (فيفا، كاف، اتحاد الكرة، النادي، اللاعب نفسه، رابطة الأندية) + الرقم أو الحدث. رجّع JSON {"q":[""]}`, { light: true, temp: 0.2 }).catch(() => ({ q: [] }));
  if (memo && !memo.qs) memo.qs = (ai.q || []).slice(0, 6);
  const qs = [...new Set([...(ai.q || []).slice(0, 6), `${short} نفي`, `حقيقة ${short}`, ...names.map((n) => `${n} ينفي`), ...names.map((n) => `${n} حقيقة`)])];
  const hits = []; const seen = new Set();
  for (const q of qs) for (const h of await search(q, 4)) {
    if (seen.has(h.url) || (h.at && h.at < since)) continue; seen.add(h.url);
    const txt = `${h.title} ${h.snippet}`;
    const about = overlap(h.title, story.topic) >= 0.25 || names.some((n) => txt.includes(n.split(' ').at(-1))) || overlap(h.title, facts) >= 0.3;
    if (about && DENY.test(txt)) hits.push(h);
  }
  if (!hits.length) return { denied: false, why: 'مفيش نفي', arts: [] };
  // متابعة لحظية من غير ما نحرق الكوتة: الحكم بيتعاد بس لو ظهر مقال جديد ما اتحكمش عليه
  if (memo) { const fresh = hits.filter((h) => !(memo.seen || []).includes(h.url)); if (!fresh.length) return { denied: false, same: true, why: 'مفيش مقالات جديدة', arts: [] }; memo.seen = [...(memo.seen || []), ...fresh.map((h) => h.url)].slice(-300); }
  // اقرا أقوى 8 مقالات (من جرايد مختلفة الأول) واحكم بكتاب الخبرة
  const byPaper = [...new Map(hits.map((h) => [h.paper, h])).values()];
  const pickH = [...byPaper, ...hits.filter((h) => !byPaper.includes(h))].slice(0, 8);
  const arts = [];
  for (const h of pickH) { const a = await article(h.url); arts.push({ ...h, text: a.text.slice(0, 1500) }); }
  const j = await json(`${PLAYBOOK}

—— الشغل دلوقتي ——
الخبر اللي إحنا نشرناه/هننشره («${story.topic}») اتبنى على الحقايق دي:
${facts}
مصادرنا الأصلية اتنشرت: ${(story.sources || []).map((x) => `${x.paper} ${x.date || '?'}`).join('، ')}. فيديونا اتعمل ${new Date(refAt).toISOString()}. ده اللي في الجرايد الكبيرة آخر 3 أيام:
${arts.map((a, i) => `### [${i}] ${a.paper} — ${a.title} (${a.at ? new Date(a.at).toISOString() : 'تاريخ مش واضح'})\n${a.snippet}\n${a.text}`).join('\n\n')}

احكم حسب كتاب الخبرة. ids = **كل** المقالات اللي فيها نفس النفي/التصحيح (من كل الجرايد). رجّع JSON {"denied":true|false,"level":"official|correction|none","facts":["F1"],"denier":"مين نفى (الجهة/الشخص)","ids":[أرقام المقالات],"summary":"النفي في سطر بالعامية","why":"ليه حكمت كده"}`, { temp: 0, light: true }); // موديلات خفيفة = كوتة منفصلة عن المصنع
  const ok = !!(j.denied && ['official', 'correction'].includes(j.level) && (j.facts || []).length);
  const src = [...new Map((j.ids || []).map((i) => arts[i]).filter(Boolean).map((a) => [a.paper, a])).values()];
  return { denied: ok, ...j, arts, src, papers: src.map((a) => a.paper) };
}

const MAIN = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
// متابعة لحظية: جولة كل 3 دقايق لحد LOOP_MIN (على السحابة 50 دقيقة، وبعدها الورك فلو يشغّل نفسه تاني = ما بيقفش)
const LOOP_MIN = +(process.env.LOOP_MIN || 0); const T0 = Date.now(); let newDenial = false;
const sh = (c, a) => { try { return execFileSync(c, a, { cwd: ROOT, stdio: 'pipe' }).toString(); } catch (e) { return ''; } };
async function round() {
  if (LOOP_MIN) { try { execFileSync('git', ['pull', '-q', '--rebase', '-X', 'theirs'], { cwd: DATA_DIR, stdio: 'pipe' }); } catch {} } // التذاكر الجديدة أول ما تتعمل
  Object.assign(W, readJson(WF, { items: {}, runs: [] })); requests.splice(0, requests.length, ...readJson(REQF, []));
  tickets.splice(0, tickets.length, ...fs.readdirSync(qdir).filter((f) => f.endsWith('.json')).map((f) => ({ f, t: readJson(path.join(qdir, f)) })).filter(({ t }) => t.kind !== 'denial' && Date.now() - new Date(t.createdAt) < 72 * 3600e3));
  log(`🛡️ ${new Date().toISOString().slice(11, 16)} بتابع ${tickets.length} خبر`);
for (const { f, t } of tickets) {
  const st = W.items[t.id] ||= { state: 'clear', checks: 0 };
  if (st.state === 'denied' && st.requested) continue;
  const story = readJson(path.join(ROOT, 'videos', t.id, 'story.json'), null);
  if (!story?.facts) { log(`⊘ ${t.id}: مفيش story.json`); continue; }
  const j = await denialCheck(story, t.createdAt, log, st);
  st.checks++; st.lastCheck = new Date().toISOString(); changed.add(WF);
  if (j.same) continue;
  if (!j.denied) { log(`✓ ${t.id}: فيه كلام بس مش نفي لخبرنا (${(j.why || '').slice(0, 120)})`); st.lastNote = j.why; changed.add(WF); continue; }
  const { papers, src } = j;
  log(`🚨 ${t.id}: اتنفى — ${j.summary} (${j.denier} · ${papers.join('، ')})`);
  const first = st.state !== 'denied';
  Object.assign(st, { state: 'denied', at: st.at || new Date().toISOString(), summary: j.summary, denier: j.denier, facts: j.facts, papers, why: j.why });

  // 1) إلغاء اللي لسه ما نزلش
  const cancelled = []; const live = [];
  for (const [p, job] of Object.entries(t.platforms || {})) {
    if (isOut(p, job)) { live.push(`${p}: ${job.url || ''}`); continue; }
    if (['cancelled', 'deleted', 'delete-manually'].includes(job.status)) { if (job.status !== 'cancelled') live.push(`${p}: ${job.url || ''}`); continue; }
    if (p === 'youtube' && job.status === 'scheduled' && !DRY) { if (!(await ytPrivate(job.url).catch(() => false))) { log(`⚠️ ${t.id}/youtube: ما قدرتش أوقف الميعاد`); continue; } }
    if (!DRY) Object.assign(job, { status: 'cancelled', why: `نفي: ${j.summary}`, cancelledAt: new Date().toISOString() });
    cancelled.push(p);
  }
  if (cancelled.length && !DRY) { t.denied = { at: st.at, summary: j.summary, denier: j.denier }; writeJson(path.join(qdir, f), t); changed.add('queue'); }

  // 2) فيديو النفي: لازم النفي نفسه يتأكد من جريدتين كبار (نفس قاعدة القناة)
  let reqd = false;
  // نفس التصحيح اتعمله فيديو قبل كده (لخبر تاني فيه نفس الرقم)؟ → نربطه بيه ومش بنعمل فيديو تاني (درس: تصحيح صلاح 68 اتعمل 3 مرات)
  const twin = requests.find((r) => r.kind === 'denial' && Date.now() - new Date(r.at) < 7 * 86400e3 && overlap(r.story?.denial?.summary || r.text || '', j.summary) >= 0.25);
  if (twin) { log(`🔗 ${t.id}: نفس تصحيح اتعمله فيديو قبل كده (${twin.video || twin.corrects}) — مش هنعمل فيديو تاني`); Object.assign(st, { requested: true, sameAs: twin.video || twin.corrects }); changed.add(WF); continue; }
  if (src.length >= 2) {
    const v = await verify({ topic: `نفي رسمي: ${j.summary} (تصحيح لخبر «${story.topic}»)`, slug: `denial-${story.slug || 'news'}`.slice(0, 30), type: 'news' }, src, log, []).catch((e) => (log(`⊘ التحقق: ${e.message}`), null));
    if (v && !DRY) {
      requests.push({ at: new Date().toISOString(), kind: 'denial', corrects: t.id, wasLive: live.length > 0, text: v.topic, story: { ...v, people: story.people, denial: { original: story.topic, summary: j.summary, denier: j.denier, wasLive: live.length > 0 } }, status: 'pending' });
      writeJson(REQF, requests); changed.add(REQF); st.requested = true; reqd = true; newDenial = true;
    }
  } else log(`⏳ ${t.id}: النفي في جريدة واحدة بس (${papers.join('، ')}) — لغيت اللي ما نزلش، وفيديو النفي لما جريدة تانية تأكد`);
  changed.add(WF);
  if (first || reqd) await tell(`🚨 فريق متابعة النفي: خبر اتنفى\n«${story.topic}»\n\nالنفي: ${j.summary}\nمين: ${j.denier} · ${papers.join('، ')}\n\n${cancelled.length ? `⛔ لغيت النشر على: ${cancelled.join('، ')}\n` : ''}${live.length ? `📢 كان نزل على: ${live.map((x) => x.split(':')[0]).join('، ')}\n` : ''}${reqd ? '🎬 بعمل فيديو النفي دلوقتي وهينزل على طول' : '⏳ فيديو النفي أول ما جريدة كبيرة تانية تأكد'}`);
}
  W.runs = [...(W.runs || []), { at: new Date().toISOString(), watched: tickets.length }].slice(-50);
  if (!DRY) { writeJson(WF, W); if (LOOP_MIN) persist('متابعة النفي'); }
  if (newDenial && LOOP_MIN && !DRY) { sh('gh', ['workflow', 'run', 'factory.yml']); log('🎬 شغّلت المصنع على فيديو النفي'); newDenial = false; }
}
if (MAIN) {
  for (let n = 0; ; n++) {
    await round().catch((e) => log(`⚠️ جولة وقعت: ${e.message}`));
    if (!LOOP_MIN || Date.now() - T0 > LOOP_MIN * 60e3) break;
    await new Promise((r) => setTimeout(r, 3 * 60e3));
  }
  const dispatch = requests.some((r) => r.kind === 'denial' && r.status === 'pending');
  fs.writeFileSync('/tmp/watch-dispatch', dispatch ? 'yes' : 'no');
  log(dispatch ? '🎬 فيه فيديو نفي مستني المصنع' : '— خلصت المتابعة');
}
