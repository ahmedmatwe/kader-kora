// فريق الإصلاح الدائم (Gemini بمفاتيح كادر كورة — من غير الماك ومن غير اشتراك Claude).
// بياخد سجل الدورة اللي وقعت، يقرا كتاب الخبرة (REPAIR_PLAYBOOK.md) والملفات اللي في الغلطة،
// يقترح تعديل صغير، يطبقه، ويتأكد بفحوصات. لو الفحوصات ما عدّتش بيرجّع كل حاجة زي ما كانت.
// الاستخدام: node scripts/auto/repair.mjs <ملف السجل> [اسم الورك فلو]
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { json } from './ai.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = process.env.REPAIR_OUT || '/tmp/repair.json';
const logFile = process.argv[2]; const wf = process.argv[3] || 'factory';
const finish = (r) => { fs.writeFileSync(OUT, JSON.stringify(r, null, 1)); console.log(`${r.status}: ${r.message}`); process.exit(0); };

const raw = logFile && fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
const log = raw.split('\n').map((l) => l.replace(/^.*?\d{2}:\d{2}:\d{2}\.\d+Z /, '')).filter((l) => !/^\[command\]|git config|submodule|Node\.js 20|safe\.directory|extraheader|DeprecationWarning|^\s*$/.test(l)).slice(-160).join('\n');
if (!log.trim()) finish({ status: 'skip', message: 'مفيش سجل غلطة' });

// 1) أسباب خارجية: ما نلمسش الكود
const EXTERNAL = /\b429\b|quota|RESOURCE_EXHAUSTED|\b503\b|high demand|ETIMEDOUT|ECONNRESET|fetch failed|socket hang up|timed out|The operation was aborted|rate limit|no-story|cancel/i;
const errLine = (log.match(/^.*(Error|error|✗|Traceback|ENOENT|SyntaxError|ReferenceError|TypeError).*$/m) || [''])[0].slice(0, 300);
if (EXTERNAL.test(errLine || log.slice(-1500)) && !/SyntaxError|ReferenceError|TypeError|ENOENT|is not defined|Cannot find/.test(log)) finish({ status: 'external', message: `سبب خارجي (كوتة/شبكة) — المصنع هيكمّل لوحده: ${errLine || 'من السجل'}` });

// 2) ما نكررش نفس الإصلاح أكتر من مرتين في اليوم
const sig = errLine.replace(/\d+/g, '#').replace(/\/home\/runner\/work\/[^ ]+?\//g, '').slice(0, 160) || 'unknown';
const repF = path.join(ROOT, 'data/repairs.json'); const reps = fs.existsSync(repF) ? JSON.parse(fs.readFileSync(repF, 'utf8')) : { runs: [] };
const today = new Date().toISOString().slice(0, 10);
const tries = reps.runs.filter((r) => r.sig === sig && r.at.startsWith(today)).length;
const record = (status, extra = {}) => { reps.runs.push({ at: new Date().toISOString(), wf, sig, status, ...extra }); reps.runs = reps.runs.slice(-200); fs.writeFileSync(repF, JSON.stringify(reps, null, 1)); };
if (tries >= 2) { record('gave-up'); finish({ status: 'gave-up', message: `نفس الغلطة اتكررت بعد محاولتين إصلاح النهارده — محتاجة تدخل: ${errLine}` }); }

// 3) الملفات المسموح تتعدل + الملفات اللي ظاهرة في الغلطة
const ALLOWED = /^(scripts\/[^/]+\.(mjs|py|sh)|scripts\/auto\/[^/]+\.(mjs|py)|motion\/src\/.+\.tsx?|bot\/worker\.js)$/;
const mentioned = [...new Set([...log.matchAll(/((?:scripts|motion\/src|bot)\/[\w./-]+\.(?:mjs|js|py|tsx?))/g)].map((m) => m[1]))].filter((f) => ALLOWED.test(f) && fs.existsSync(path.join(ROOT, f)));
const base = [...new Set([...mentioned, ...(wf === 'factory' ? ['scripts/auto/factory.mjs'] : [])])];
// + الملفات اللي بيستورد منها (عشان يعرف أسماء الدوال وشكلها الحقيقي)
const imports = base.flatMap((f) => [...fs.readFileSync(path.join(ROOT, f), 'utf8').matchAll(/from '(\.{1,2}\/[^']+)'/g)].map((m) => path.relative(ROOT, path.resolve(path.dirname(path.join(ROOT, f)), m[1])))).filter((f) => ALLOWED.test(f) && fs.existsSync(path.join(ROOT, f)));
const files = [...new Set([...base, ...imports])].slice(0, 7);
const playbook = fs.readFileSync(path.join(ROOT, 'REPAIR_PLAYBOOK.md'), 'utf8');
const src = files.map((f) => `===== ${f}\n${fs.readFileSync(path.join(ROOT, f), 'utf8').slice(0, 60000)}`).join('\n\n');

// 4) الفحوصات بعد أي تعديل
function checks(changed) {
  const errs = [];
  for (const f of changed) {
    const p = path.join(ROOT, f);
    try {
      if (/\.(mjs|js)$/.test(f)) execFileSync('node', ['--check', p], { stdio: 'pipe' });
      if (/\.py$/.test(f)) execFileSync('python3', ['-m', 'py_compile', p], { stdio: 'pipe' });
      if (/\.sh$/.test(f)) execFileSync('bash', ['-n', p], { stdio: 'pipe' });
    } catch (e) { errs.push(`${f}: ${String(e.stderr || e.message).slice(0, 400)}`); }
  }
  // تحميل الموديولات (بيمسك المتغيرات الناقصة على مستوى الملف)
  for (const m of ['ai', 'news', 'pick', 'write', 'photo', 'voice', 'qa', 'titles', 'notify']) {
    try { execFileSync('node', ['-e', `import('./scripts/auto/${m}.mjs').then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)})`], { cwd: ROOT, stdio: 'pipe', env: { ...process.env, GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'AIza' + 'x'.repeat(35) } }); } catch (e) { errs.push(`${m}.mjs: ${String(e.stderr || e.message).slice(0, 300)}`); }
  }
  if (changed.some((f) => f.startsWith('motion/')) && fs.existsSync(path.join(ROOT, 'motion/node_modules'))) {
    try { execFileSync('npx', ['tsc', '--noEmit', '-p', '.'], { cwd: path.join(ROOT, 'motion'), stdio: 'pipe' }); } catch (e) { errs.push(`tsc: ${String(e.stdout || e.stderr || e.message).slice(0, 600)}`); }
  }
  return errs;
}

// 5) التشخيص + الإصلاح (محاولتين، التانية بتاخد نتيجة الفحص)
let feedback = '';
for (let attempt = 0; attempt < 2; attempt++) {
  const r = await json(`إنت فريق الإصلاح الدائم لمصنع فيديوهات «كادر كورة». مهمتك: تلاقي السبب الجذري للغلطة وتصلّحه بأصغر تعديل ممكن.

${playbook}

===== سجل الدورة اللي وقعت (${wf}):
${log.slice(-9000)}

===== الملفات:
${src || '(مفيش ملفات ظاهرة في الغلطة)'}
${feedback ? `\n===== محاولتك اللي فاتت ما عدّتش الفحص:\n${feedback}\n` : ''}
رجّع JSON:
{"diagnosis":"سطرين بالمصري: الغلطة إيه وسببها","external":false,"confident":true,
 "edits":[{"file":"scripts/auto/x.mjs","find":"نص موجود في الملف بالظبط (سطر أو أكتر، فريد)","replace":"النص الجديد"}]}
- find لازم يكون منسوخ حرف بحرف من الملف وموجود مرة واحدة بس.
- الملفات المسموحة بس: scripts/ و motion/src/ و bot/worker.js. ممنوع data/ و queue/ و .github/.
- لو السبب خارجي أو مش متأكد: external=true أو confident=false و edits فاضية.`, { temp: 0.1 });
  if (r.external || !r.confident || !(r.edits || []).length) { record('diagnosed', { diagnosis: r.diagnosis }); finish({ status: 'diagnosed', message: r.diagnosis || 'مفيش إصلاح مؤكد' }); }
  // تطبيق
  const backup = new Map(); const bad = [];
  for (const e of r.edits) {
    const f = String(e.file || '').replace(/^\.?\//, ''); const p = path.join(ROOT, f);
    if (!ALLOWED.test(f) || !fs.existsSync(p)) { bad.push(`${f}: مش مسموح أو مش موجود`); continue; }
    const cur = backup.has(f) ? fs.readFileSync(p, 'utf8') : (backup.set(f, fs.readFileSync(p, 'utf8')), backup.get(f));
    const n = e.find ? cur.split(e.find).length - 1 : 0;
    if (n !== 1) { bad.push(`${f}: النص المطلوب تغييره موجود ${n} مرة`); continue; }
    fs.writeFileSync(p, cur.replace(e.find, () => e.replace ?? ''));
  }
  const changed = [...backup.keys()];
  let errs = bad.length ? bad : checks(changed);
  // مراجع مستقل: هل الإصلاح بيحل السبب الجذري من غير ما يكسر أو يقفل أي ميزة؟
  if (!errs.length && changed.length) {
    const diff = changed.map((f) => { try { return execFileSync('git', ['diff', '--', f], { cwd: ROOT, encoding: 'utf8' }); } catch { return ''; } }).join('\n');
    const rv = await json(`إنت مراجع كود مستقل وصارم في «كادر كورة». فريق الإصلاح عمل التعديل ده عشان يحل الغلطة اللي في السجل.
${playbook.slice(0, 6000)}
===== السجل:\n${log.slice(-4000)}
===== الملفات قبل التعديل:\n${src.slice(0, 50000)}
===== التعديل (diff):\n${diff.slice(0, 8000)}
افحص: (1) بيحل السبب الجذري فعلًا؟ (2) بيستخدم الدوال والمتغيرات صح حسب الملفات (مثلًا دالة لازم تتنادى بـ ()؟ خاصية موجودة فعلًا؟) (3) ما بيقفلش أو يعطّل ميزة بصمت (شرط دايمًا true/false، return بدري، catch بيبلع الغلطة) (4) ما بيكسرش قواعد الكتاب.
رجّع JSON {"approve":true|false,"why":"سطر بالمصري"}`, { temp: 0 }).catch(() => ({ approve: false, why: 'المراجع ما ردّش' }));
    if (!rv.approve) errs = [`المراجع رفض: ${rv.why}`];
  }
  if (!errs.length && changed.length) { record('fixed', { files: changed, diagnosis: r.diagnosis }); finish({ status: 'fixed', message: r.diagnosis, files: changed }); }
  for (const [f, c] of backup) fs.writeFileSync(path.join(ROOT, f), c); // رجوع
  feedback = errs.join('\n');
}
record('failed', { feedback: feedback.slice(0, 500) });
finish({ status: 'failed', message: `ما قدرتش أصلّح بأمان (رجّعت كل حاجة): ${errLine}` });
