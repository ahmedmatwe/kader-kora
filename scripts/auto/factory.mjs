// 🏭 المصنع: دورة واحدة = فيديو واحد كامل (تريند → تحقيق → هوك → سيناريو → مراجعة → صورة → مشاهد → صوت → رندر → مراجعة → عناوين → طابور).
// بيشتغل على GitHub Actions كل ساعة ونص (من غير الماك). كل مرحلة ليها مراجعة، وأي فشل بيوقف الفيديو ده بس.
// node scripts/auto/factory.mjs [--dry]   (--dry: لحد السيناريو بس من غير صوت/رندر)
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
import { ROOT, readJson, writeJson, cairoHour } from '../lib.mjs';
import { pickStory } from './pick.mjs';
import { hooks, script, reviewScript, scenes, checkScenes, factsText } from './write.mjs';
import { findPhotos } from './photo.mjs';
import { voice, QuotaError } from './voice.mjs';
import { reviewFrames } from './qa.mjs';
import { makeTitles } from './titles.mjs';
import { tell, sendVideo } from './notify.mjs';
const DRY = process.argv.includes('--dry');
const FF = fs.existsSync('/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg') ? '/opt/homebrew/opt/ffmpeg-full/bin/' : '';
const LOGF = path.join(ROOT, 'data/factory.json'); const flog = readJson(LOGF, { runs: [] });
const cfg = readJson(path.join(ROOT, 'data/config.json'), { autoApprove: false, dailyTarget: 12, platforms: ['youtube', 'facebook', 'instagram'] });
const lines = []; const log = (s) => { console.log(s); lines.push(s); };
const QUIET_STATUS = ['disabled', 'daily-target-reached', 'no-story', 'dry'];
const done = async (status, extra = {}) => { if (!QUIET_STATUS.includes(status) && status !== 'queued') await tell(`⚠️ فيديو ما كملش (${status})${extra.topic ? `\n«${extra.topic}»` : ''}\n${lines.slice(-2).join('\n')}`); flog.runs.push({ at: new Date().toISOString(), status, ...extra, log: lines.slice(-40) }); flog.runs = flog.runs.slice(-200); writeJson(LOGF, flog); console.log(`\n== ${status}`); process.exit(0); };

if (!cfg.enabled) await done('disabled');
// حد يومي (الكوتة): ما نعملش أكتر من dailyTarget في اليوم
const today = new Date().toISOString().slice(0, 10);
const madeToday = flog.runs.filter((r) => r.status === 'queued' && r.at.startsWith(today)).length;
if (madeToday >= cfg.dailyTarget) await done('daily-target-reached', { madeToday });

// 1) التريند + التحقيق
const topics = readJson(path.join(ROOT, 'data/topics.json'), []);
const recent = topics.filter((t) => Date.now() - new Date(t.at) < 5 * 86400e3).map((t) => t.topic);
const onErr = async (e) => { if (/429|quota/i.test(String(e?.message))) await done('llm-quota', { error: String(e.message).slice(0, 200) }); console.error(e); await tell(`✗ المصنع وقع: ${String(e?.message || e).slice(0, 300)}`); process.exit(1); };
process.on('unhandledRejection', onErr); process.on('uncaughtException', onErr);
const requests = readJson(path.join(ROOT, 'data/requests.json'), []);
const req = requests.find((r) => r.status === 'pending');
const story = await pickStory({ recent, log, request: req?.text });
if (req) { req.status = story ? 'done' : 'not-found'; req.at2 = new Date().toISOString(); writeJson(path.join(ROOT, 'data/requests.json'), requests); if (!story) await tell(`🔎 الموضوع اللي طلبته «${req.text}» ما لقيتهوش في جريدتين كبار — مش هعمله عشان المصداقية.`); }
if (!story) await done('no-story');

// 2) هوك → سيناريو → مراجعة مستقلة
const hk = await hooks(story); if (!hk.best) await done('no-hook', { topic: story.topic });
log(`🪝 الهوك: ${hk.best}`);
let sc; let rv; let notes = [];
for (let a = 0; a < 3; a++) { // سيناريو → مراجعة مستقلة → إعادة كتابة بملاحظات المراجع لحد ما يعدّي
  const draft = await script(story, hk.best, notes);
  rv = await reviewScript(story, draft);
  if (rv.issues?.length) log(`🔎 مراجعة السيناريو (${a + 1}): ${rv.issues.join(' | ')}`);
  if (rv.dropped) log(`✂️ المراجع شال ${rv.dropped} سطر مالوش سند`);
  sc = { lines: rv.lines.map(({ support, ...l }) => l) };
  const w = sc.lines.map((l) => l.vo).join(' ').split(/\s+/).length;
  if (rv.hookOk && sc.lines.length >= 5 && w >= 60 && sc.lines.at(-1)?.id === 'outro') break;
  notes = [...(rv.issues || []), `بعد شيل السطور اللي مالهاش سند فضل ${sc.lines.length} سطر و${w} كلمة — اكتب سطور أكتر من الحقايق المؤكدة F بس`];
}
if (!rv.hookOk) await done('hook-unsupported', { topic: story.topic, issues: rv.issues });
const nWords = sc.lines.map((l) => l.vo).join(' ').split(/\s+/).length;
if (sc.lines.length < 5 || nWords < 60 || nWords > 145 || sc.lines.at(-1).id !== 'outro') await done('script-shape', { topic: story.topic, nWords });
for (const l of sc.lines) l.hi = (l.hi || []).filter((h) => h && l.vo.includes(h));

// 3) رقم الفيديو + الفولدر
const used = [...fs.readdirSync(path.join(ROOT, 'videos')), ...fs.readdirSync(path.join(ROOT, 'queue'))].map((x) => parseInt(x, 10)).filter(Number.isFinite);
const num = String(Math.max(1, ...used) + 1).padStart(2, '0');
const slug = (story.slug || 'news').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'news';
const id = `${num}-${slug}`; const dir = path.join(ROOT, 'videos', id); fs.mkdirSync(path.join(dir, 'final'), { recursive: true });
log(`🎬 ${id}: ${story.topic}`);
if (!DRY) await tell(`🎬 بدأت فيديو جديد:\n«${story.topic}»\n(${new Set(story.sources.map((x) => x.paper)).size} جرايد)`);
writeJson(path.join(dir, 'story.json'), { ...story, hooks: hk.all, scriptReview: rv.issues || [] });
fs.writeFileSync(path.join(dir, 'sources.md'), `# ${story.topic}\n\n## الحقايق المؤكدة\n${factsText(story)}\n\n## المصادر\n${story.sources.map((s) => `- ${s.paper}: ${s.title} — ${s.url} (${s.date || ''})`).join('\n')}\n`);
writeJson(path.join(dir, 'script.json'), { version: 2, lines: sc.lines });
if (DRY) await done('dry', { id, topic: story.topic });

// 4) صورة مرخصة (اختياري) + المشاهد
const media = path.join(ROOT, 'motion/public/media'); fs.mkdirSync(media, { recursive: true });
const photos = await findPhotos(story.people, id, media, log).catch((e) => (log(`⊘ صور: ${e.message}`), []));
const photo = photos[0] || null;
let sn; let errs = [];
for (let a = 0; a < 3; a++) {
  sn = await scenes(story, sc.lines, photos.map((p) => ({ src: p.src, label: p.label, credit: p.credit, focusX: p.focusX, person: p.person })));
  sn.scenes = (sn.scenes || []).filter((s) => s.type !== 'photo' || photos.some((p) => p.src === s.src));
  for (const s of sn.scenes) if (s.type === 'photo') { const p = photos.find((x) => x.src === s.src); Object.assign(s, { label: p.label, credit: p.credit, focusX: s.focusX ?? p.focusX }); }
  errs = checkScenes(sn, sc.lines); if (!errs.length) break; log(`⟳ المشاهد: ${errs.join(' | ')}`);
}
if (errs.length) await done('scenes-failed', { id, errs });
const papers = [...new Set(story.sources.map((s) => s.paper))];
writeJson(path.join(dir, 'scenes.json'), { trend: sn.trend, keep: sn.keep || [], sources: `المصادر: ${papers.join(' · ')}`, scenes: sn.scenes });

// 5) الصوت (طلب واحد) + مراجعة الصوت
try { await voice(dir, sc.lines, log); } catch (e) { if (e instanceof QuotaError) await done('tts-quota', { id, error: e.message }); throw e; }

// 6) الخطة + الرندر (نسخة واحدة) + نسخة يوتيوب بالموسيقى (ffmpeg، من غير رندر تاني)
execFileSync('python3', [path.join(ROOT, 'scripts/build_plan.py'), dir], { stdio: 'ignore' });
fs.copyFileSync(path.join(dir, 'build/voice.wav'), path.join(media, 'voice.wav'));
const plan = readJson(path.join(dir, 'build/plan.json'));
const social = path.join(dir, 'final', `${id}-social.mp4`); const yt = path.join(dir, 'final', `${id}-youtube.mp4`);
execFileSync('npx', ['remotion', 'render', 'src/index.ts', 'NewsShort', social, `--props=${path.join(dir, 'build/plan.json')}`, '--codec=h264', '--crf=19', '--audio-bitrate=192k', '--log=error', `--concurrency=${process.env.RENDER_CONCURRENCY || '100%'}`], { cwd: path.join(ROOT, 'motion'), stdio: 'inherit' });
const music = path.join(ROOT, 'assets/music/music.mp3');
execFileSync(`${FF}ffmpeg`, ['-loglevel', 'error', '-y', '-i', social, '-stream_loop', '-1', '-i', music, '-filter_complex', `[1:a]volume=0.07,afade=t=in:d=0.5,afade=t=out:st=${Math.max(0, plan.duration - 1.2)}:d=1.2[m];[0:a][m]amix=inputs=2:duration=first:normalize=0[a]`, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', yt]);
execFileSync(`${FF}ffmpeg`, ['-loglevel', 'error', '-y', '-ss', '1.2', '-i', social, '-frames:v', '1', '-q:v', '2', path.join(dir, 'final', `${id}-cover.jpg`)]);
const srt = (t) => { const ms = Math.round(t * 1000); const h = String(Math.floor(ms / 3600000)).padStart(2, '0'), m = String(Math.floor(ms / 60000) % 60).padStart(2, '0'), s = String(Math.floor(ms / 1000) % 60).padStart(2, '0'); return `${h}:${m}:${s},${String(ms % 1000).padStart(3, '0')}`; };
fs.writeFileSync(path.join(dir, 'final', `${id}.ar.srt`), plan.captions.map((c, i) => `${i + 1}\n${srt(c.start)} --> ${srt(c.end)}\n${c.text.replace(/\*/g, '')}\n`).join('\n'));
log(`🎞️ اترندر: ${plan.duration}ث`);

// 7) مراجعة الفيديو النهائي
const qa = await reviewFrames(social, plan, dir);
if (!qa.pass) { log(`✗ مراجعة الجودة: ${(qa.problems || []).map((p) => `فريم ${p.frame}: ${p.issue}`).join(' | ')}`); await done('qa-failed', { id, problems: qa.problems }); }
log('✓ مراجعة الجودة عدّت');

// 8) فريق العناوين
const t = await makeTitles({ topic: story.topic, script: sc.lines.map((l) => l.vo).join('\n'), facts: factsText(story) });
writeJson(path.join(dir, 'titles.json'), t);
const f = (x) => `final/${id}-${x}`;
writeJson(path.join(dir, 'publish.json'), {
  id, approved: false, approvedBy: null,
  youtube: { file: f('youtube.mp4'), srt: `final/${id}.ar.srt`, title: t.youtube.title, description: t.youtube.description, tags: ['كادر كورة', 'كورة', ...(story.people || []).map((p) => p.ar)] },
  facebook: { file: f('social.mp4'), srt: `final/${id}.ar.srt`, caption: t.facebook.caption },
  instagram: { file: f('social.mp4'), caption: t.instagram.caption, cover: f('cover.jpg') },
  tiktok: { file: f('social.mp4'), caption: t.tiktok.caption, cover: f('cover.jpg') },
});

// 9) رفع الملفات (ريليس خاص) + تذكرة الطابور بمواعيد فريق المواعيد
const rel = `v-${id}`;
execFileSync('gh', ['release', 'create', rel, social, yt, path.join(dir, 'final', `${id}-cover.jpg`), path.join(dir, 'final', `${id}.ar.srt`), '--title', id, '--notes', story.topic], { cwd: ROOT, stdio: 'inherit' });
const sched = JSON.parse(execFileSync('node', [path.join(ROOT, 'scripts/schedule.mjs'), '--type', story.type || 'news'], { encoding: 'utf8' }).trim().split('\n').pop());
const queued = fs.readdirSync(path.join(ROOT, 'queue')).filter((x) => x.endsWith('.json')).map((x) => readJson(path.join(ROOT, 'queue', x)));
const slot = (p) => { // ما نحطش فيديوهين على نفس المنصة في أقل من 50 دقيقة، ومن غير ساعات النوم
  let at = new Date(sched[p]).getTime();
  for (let i = 0; i < 80; i++) {
    const h = cairoHour(new Date(at).toISOString());
    const clash = queued.some((q) => q.platforms?.[p]?.at && Math.abs(new Date(q.platforms[p].at) - at) < 50 * 60e3);
    if (!clash && !(h >= 1 && h < 10)) break; at += 30 * 60e3;
  }
  return new Date(at).toISOString();
};
// كوتة يوتيوب (~6 رفعات في اليوم): الزيادة تتنشر على فيس وإنستا بس
const ytToday = queued.filter((q) => q.platforms?.youtube && (q.createdAt || '').startsWith(today)).length;
const plats = cfg.platforms.filter((p) => p !== 'youtube' || ytToday < (cfg.youtubeDaily ?? 6));
const ticket = { id, release: rel, topic: story.topic, approved: !!cfg.autoApprove, approvedBy: cfg.autoApprove ? cfg.approvedBy : null, createdAt: new Date().toISOString(), qa: { script: rv.issues || [], frames: 'pass' }, platforms: Object.fromEntries(plats.map((p) => [p, { at: slot(p), status: 'pending' }])) };
writeJson(path.join(ROOT, 'queue', `${id}.json`), ticket);
topics.push({ at: new Date().toISOString(), topic: story.topic, id }); writeJson(path.join(ROOT, 'data/topics.json'), topics.slice(-300));
for (const p of photos) fs.rmSync(path.join(media, p.file), { force: true });
log(`📬 في الطابور${ticket.approved ? ' (موافقة دائمة من صاحب القناة)' : ' — مستني موافقتك'}: ${Object.entries(ticket.platforms).map(([p, v]) => `${p} ${v.at}`).join(' · ')}`);
await sendVideo(social, `✅ فيديو جاهز: ${t.youtube.title}\n${plan.duration} ثانية · مواعيد النشر: ${Object.entries(ticket.platforms).map(([p, v]) => `${p} ${new Date(v.at).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo', hour: 'numeric', minute: '2-digit', weekday: 'short' })}`).join(' · ')}${ticket.approved ? '\n(موافقة دائمة — هيتنشر لوحده)' : '\nتنشره؟'}`, id);
await done('queued', { id, topic: story.topic });
