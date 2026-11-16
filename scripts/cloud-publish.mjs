// بيشتغل على GitHub Actions (من غير الماك): بيقرا تذاكر queue/*.json وينفذ اللي عليه الدور.
// التذكرة: { id, approved:true, approvedBy, platforms:{ youtube:{at, status} , ...}, release }
// يوتيوب: بيترفع أول ما التذكرة تتعمل ومعاه publishAt — يوتيوب نفسه بينشره في الميعاد بالظبط.
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
import { ROOT, readJson, writeJson, addPost, DATA_REPO, dataEnv } from './lib.mjs';
import * as meta from './meta.mjs';
import { scheduleTikTok } from './buffer.mjs';
import { alreadyOut, persist, sameNews } from './guard.mjs';
import { tell as tellOwner } from './auto/notify.mjs';
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
    // 🔒 حارس النشر: حجز قديم ما اتقفلش (الرفع وقع بعد النشر) → نتأكد من المنصة نفسها بدل ما ننشر تاني
    if (job.status === 'publishing') {
      const pk = readJson(path.join(vdir, 'publish.json'), null);
      const hit = pk && await alreadyOut(plat, pk).catch((e) => (console.log(`🔒 ${t.id}/${plat}: المنصة ما ردّتش (${e.message}) — مش هنشر`), 'unknown'));
      if (hit === 'unknown') continue;
      if (hit) { Object.assign(job, { status: plat === 'youtube' ? 'scheduled' : 'published', id: hit.id, url: hit.url, doneAt: new Date().toISOString(), guard: 'لقيته منشور على المنصة' }); console.log(`🔒 ${t.id}/${plat}: كان اتنشر فعلًا ${hit.url} — اتسجّل ومش هيتنشر تاني`); changed = true; continue; }
      if (Date.now() - new Date(job.claimAt) < 40 * 60e3) { console.log(`🔒 ${t.id}/${plat}: لسه بيتنشر من دورة تانية`); continue; }
      if (plat === 'tiktok') { job.status = 'check'; job.why = 'حجز قديم — اتأكد من Buffer بالإيد'; changed = true; continue; } // Buffer مالوش فحص عنوان عندنا → ما نعيدش النشر على العمياني
      job.status = 'retry';
    }
    if (job.status && job.status !== 'pending' && job.status !== 'retry') continue;
    const connected = plat === 'youtube' || (plat === 'tiktok' && process.env.BUFFER_API_KEY) || ((plat === 'facebook' || plat === 'instagram') && process.env.META_PAGE_TOKEN);
    if (!connected) { console.log(`… ${t.id}/${plat}: المنصة لسه مش متربطة على السحابة`); continue; }
    // فيس وإنستا مالهمش جدولة في الـAPI بتاعنا → بننشر لما الميعاد ييجي (المهمة بتصحى كل نص ساعة)
    if (plat !== 'youtube' && job.at && new Date(job.at) - Date.now() > 30 * 60e3) { // اللي ميعاده خلال نص ساعة بينزل دلوقتي (مانستناش دورة نشر تانية ممكن تتأخر)
      console.log(`⏳ ${t.id}/${plat}: ميعاده ${job.at}`); continue; }
    // 🔒 حارس النشر: (1) المنصة نفسها — منشور قبل كده؟ (2) حجز مرفوع للريبو قبل النشر، ولو ما اترفعش ما ننشرش
    {
      const pk = readJson(path.join(vdir, 'publish.json'), null); if (!pk?.[plat]) { console.log(`⊘ ${t.id}/${plat}: مفيش publish.json`); continue; }
      let hit; try { hit = await alreadyOut(plat, pk); } catch (e) { console.log(`🔒 ${t.id}/${plat}: ما قدرتش أتأكد من المنصة (${e.message}) — مش هنشر المرة دي`); continue; }
      if (hit) { Object.assign(job, { status: plat === 'youtube' ? 'scheduled' : 'published', id: hit.id, url: hit.url, doneAt: new Date().toISOString(), guard: 'لقيته منشور على المنصة' }); console.log(`🔒 ${t.id}/${plat}: منشور قبل كده ${hit.url} — مش هيتنشر تاني`); writeJson(p, t); persist(`حارس النشر: ${t.id}/${plat} منشور قبل كده`); changed = true; continue; }
      { const led = readJson(path.join(ROOT, 'data/posts.json'), []); const d = await sameNews(t, pk, t.kind === 'denial' ? led.filter((x) => /denial/.test(x.video)) : led).catch(() => '');
        if (d) { for (const j2 of Object.values(t.platforms)) if (['pending', 'retry'].includes(j2.status)) Object.assign(j2, { status: 'cancelled', why: `تكرار خبر: ${d}` }); writeJson(p, t); persist(`حارس النشر: ${t.id} نفس خبر اتنشر`); console.log(`🔒 ${t.id}: نفس خبر اتنشر قبل كده — اتلغى: ${d}`); await tellOwner(`🔒 حارس النشر وقف فيديو مكرر\n«${t.topic}»\nنفس خبر: ${d}`); changed = true; break; } }
      const prev = job.status; Object.assign(job, { status: 'publishing', claimAt: new Date().toISOString() }); writeJson(p, t);
      if (!persist(`حارس النشر: حجز ${t.id}/${plat}`)) { job.status = prev; delete job.claimAt; writeJson(p, t); console.log(`🔒 ${t.id}/${plat}: الحجز ما اترفعش — مش هنشر`); continue; }
    }
    if (plat !== 'youtube') {
      try {
        const pack = readJson(path.join(vdir, 'publish.json'));
        execFileSync('gh', ['release', 'download', '-R', DATA_REPO, t.release, '--pattern', '*social.mp4', '--dir', path.join(vdir, 'final'), '--clobber'], { stdio: 'inherit', env: dataEnv() });
        const file = path.join(vdir, pack[plat].file);
        const r = plat === 'tiktok' ? await (async () => { const url = hostMedia(t.id, file); if (!url) throw new Error('محتاج MEDIA_TOKEN عشان Buffer يسحب الفيديو'); const b = await scheduleTikTok(url, pack.tiktok.caption, new Date().toISOString()); return { id: b.id, url: 'https://www.tiktok.com/@kader_kora' }; })()
          : plat === 'facebook' ? await meta.facebookReel(file, pack.facebook.caption) : await meta.instagramReel(file, pack.instagram.caption, 1500, undefined, job.videoUrl || hostMedia(t.id, file));
        Object.assign(job, { status: 'published', id: r.id, url: r.url, doneAt: new Date().toISOString() });
        addPost({ platform: plat, video: t.id, id: r.id, url: r.url, publishAt: new Date().toISOString(), title: pack.youtube.title, status: 'published' });
        console.log(`✓ ${t.id}/${plat}: اتنشر ${r.url}`);
      } catch (e) { job.tries = (job.tries || 0) + 1; job.status = job.tries >= 3 ? 'failed' : 'retry'; job.error = String(e.message).slice(-400); console.error(`✗ ${t.id}/${plat}:`, job.error); }
      changed = true; writeJson(p, t); persist(`نشر: ${t.id}/${plat}`); continue;
    }
    try {
      // نزّل ملفات الفيديو من الريليس الخاص
      execFileSync('gh', ['release', 'download', '-R', DATA_REPO, t.release, '--dir', path.join(vdir, 'final'), '--clobber'], { stdio: 'inherit', env: dataEnv() });
      const out = execFileSync('node', [path.join(ROOT, 'scripts/publish-youtube.mjs'), `videos/${t.id}`, ...(job.at && new Date(job.at) - Date.now() > 20 * 60e3 ? ['--at', job.at] : [])] /* نشر مباشر: الميعاد قريب = علني على طول (يوتيوب بيرفض جدولة أقل من ربع ساعة) */, { encoding: 'utf8' });
      console.log(out); const url = out.match(/https:\/\/youtube\.com\/shorts\/\S+/)?.[0];
      Object.assign(job, { status: url ? 'scheduled' : 'check', url, doneAt: new Date().toISOString() });
    } catch (e) { job.tries = (job.tries || 0) + 1; job.status = job.tries >= 3 ? 'failed' : 'retry'; job.error = String(e.stderr || e.message).slice(-400); console.error(`✗ ${t.id}/${plat}:`, job.error); }
    changed = true; writeJson(p, t); persist(`نشر: ${t.id}/${plat}`);
  }
  writeJson(p, t);
}
console.log(changed ? 'اتحدّث الطابور' : 'مفيش حاجة عليها الدور');
