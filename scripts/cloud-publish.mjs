// بيشتغل على GitHub Actions (من غير الماك): بيقرا تذاكر queue/*.json وينفذ اللي عليه الدور.
// التذكرة: { id, approved:true, approvedBy, platforms:{ youtube:{at, status} , ...}, release }
// يوتيوب: بيترفع أول ما التذكرة تتعمل ومعاه publishAt — يوتيوب نفسه بينشره في الميعاد بالظبط.
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
import { ROOT, readJson, writeJson } from './lib.mjs';
const qdir = path.join(ROOT, 'queue'); let changed = false;
for (const f of fs.existsSync(qdir) ? fs.readdirSync(qdir).filter((x) => x.endsWith('.json')) : []) {
  const p = path.join(qdir, f); const t = readJson(p);
  if (!t.approved || !t.approvedBy) { console.log(`⏸ ${t.id}: مش متوافق عليه — متجاهل`); continue; }
  const vdir = path.join(ROOT, 'videos', t.id); fs.mkdirSync(path.join(vdir, 'final'), { recursive: true });
  for (const [plat, job] of Object.entries(t.platforms)) {
    if (job.status && job.status !== 'pending' && job.status !== 'retry') continue;
    if (plat !== 'youtube') { console.log(`… ${t.id}/${plat}: المنصة لسه مش متربطة على السحابة`); continue; }
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
