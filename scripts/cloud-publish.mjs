// بيشتغل على GitHub Actions (من غير الماك): بيقرا تذاكر queue/*.json وينفذ اللي عليه الدور.
// التذكرة: { id, approved:true, approvedBy, platforms:{ youtube:{at, status} , ...}, release }
// يوتيوب: بيترفع أول ما التذكرة تتعمل ومعاه publishAt — يوتيوب نفسه بينشره في الميعاد بالظبط.
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
import { ROOT, readJson, writeJson, addPost } from './lib.mjs';
import * as meta from './meta.mjs';
const qdir = path.join(ROOT, 'queue'); let changed = false;
// استضافة عامة لفيديو إنستجرام (ريبو ahmedmatwe/kader-kora-media) — محتاج MEDIA_TOKEN؛ من غيره بيرجع للرفع المباشر
const MEDIA = 'ahmedmatwe/kader-kora-media';
function hostMedia(id, file) {
  const url = `https://raw.githubusercontent.com/${MEDIA}/main/${id}.mp4`;
  const env = { ...process.env, GH_TOKEN: process.env.MEDIA_TOKEN || '' };
  if (!process.env.MEDIA_TOKEN) { console.log('ℹ️ MEDIA_TOKEN مش موجود — إنستجرام هيترفع مباشر (بيفشل لو > 30 ث)'); return ''; }
  try { execFileSync('gh', ['api', `repos/${MEDIA}/contents/${id}.mp4`, '--silent'], { env, stdio: 'ignore' }); return url; } catch {} // موجود قبل كده
  const b64 = fs.readFileSync(file).toString('base64'); const body = path.join(ROOT, `.media-${id}.json`);
  fs.writeFileSync(body, JSON.stringify({ message: `فيديو ${id}`, content: b64 }));
  try { execFileSync('gh', ['api', '-X', 'PUT', `repos/${MEDIA}/contents/${id}.mp4`, '--input', body, '--silent'], { env, stdio: 'inherit' }); } finally { fs.rmSync(body, { force: true }); }
  execFileSync('sleep', ['5']); return url;
}
for (const f of fs.existsSync(qdir) ? fs.readdirSync(qdir).filter((x) => x.endsWith('.json')) : []) {
  const p = path.join(qdir, f); const t = readJson(p);
  if (!t.approved || !t.approvedBy) { console.log(`⏸ ${t.id}: مش متوافق عليه — متجاهل`); continue; }
  const vdir = path.join(ROOT, 'videos', t.id); fs.mkdirSync(path.join(vdir, 'final'), { recursive: true });
  for (const [plat, job] of Object.entries(t.platforms)) {
    if (job.status && job.status !== 'pending' && job.status !== 'retry') continue;
    const connected = plat === 'youtube' || ((plat === 'facebook' || plat === 'instagram') && process.env.META_PAGE_TOKEN);
    if (!connected) { console.log(`… ${t.id}/${plat}: المنصة لسه مش متربطة على السحابة`); continue; }
    // فيس وإنستا مالهمش جدولة في الـAPI بتاعنا → بننشر لما الميعاد ييجي (المهمة بتصحى كل نص ساعة)
    if (plat !== 'youtube' && job.at && new Date(job.at) > new Date()) { console.log(`⏳ ${t.id}/${plat}: ميعاده ${job.at}`); continue; }
    if (plat !== 'youtube') {
      try {
        const pack = readJson(path.join(vdir, 'publish.json'));
        execFileSync('gh', ['release', 'download', t.release, '--pattern', '*social.mp4', '--dir', path.join(vdir, 'final'), '--clobber'], { stdio: 'inherit' });
        const file = path.join(vdir, pack[plat].file);
        const r = plat === 'facebook' ? await meta.facebookReel(file, pack.facebook.caption) : await meta.instagramReel(file, pack.instagram.caption, 1500, undefined, job.videoUrl || hostMedia(t.id, file));
        Object.assign(job, { status: 'published', id: r.id, url: r.url, doneAt: new Date().toISOString() });
        addPost({ platform: plat, video: t.id, id: r.id, url: r.url, publishAt: new Date().toISOString(), title: pack.youtube.title, status: 'published' });
        console.log(`✓ ${t.id}/${plat}: اتنشر ${r.url}`);
      } catch (e) { job.tries = (job.tries || 0) + 1; job.status = job.tries >= 3 ? 'failed' : 'retry'; job.error = String(e.message).slice(-400); console.error(`✗ ${t.id}/${plat}:`, job.error); }
      changed = true; continue;
    }
    try {
      // نزّل ملفات الفيديو من الريليس الخاص
      execFileSync('gh', ['release', 'download', t.release, '--dir', path.join(vdir, 'final'), '--clobber'], { stdio: 'inherit' });
      const out = execFileSync('node', [path.join(ROOT, 'scripts/publish-youtube.mjs'), `videos/${t.id}`, ...(job.at ? ['--at', job.at] : [])], { encoding: 'utf8' });
      console.log(out); const url = out.match(/https:\/\/youtube\.com\/shorts\/\S+/)?.[0];
      Object.assign(job, { status: url ? 'scheduled' : 'check', url, doneAt: new Date().toISOString() });
    } catch (e) { job.tries = (job.tries || 0) + 1; job.status = job.tries >= 3 ? 'failed' : 'retry'; job.error = String(e.stderr || e.message).slice(-400); console.error(`✗ ${t.id}/${plat}:`, job.error); }
    changed = true;
  }
  writeJson(p, t);
}
console.log(changed ? 'اتحدّث الطابور' : 'مفيش حاجة عليها الدور');
