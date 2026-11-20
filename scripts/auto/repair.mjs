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
const cd = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }); const today = cd(Date.now());
const tries = reps.runs.filter((r) => r.sig === sig && cd(r.at) === today).length;
const record = (status, extra = {}) => { reps.runs.push({ at: new Date().toISOString(), wf, sig, status, ...extra }); reps.runs = reps.runs.slice(-200); fs.writeFileSync(repF, JSON.stringify(reps, null, 1)); };
if (tries >= 2) { record('gave-up'); finish({ status: 'gave-up', message: `نفس الغلطة اتكررت بعد محاولتين إصلاح النهارده — محتاجة تدخل: ${errLine}` }); }

// 3) الملفات المسموح تتعدل + الملفات اللي ظاهرة في الغلطة
const ALLOWED = /^(scripts\/[^/]+\.(mjs|py|sh)|scripts\/auto\/[^/]+\.(mjs|py)|motion\/src\/.+\.tsx?|bot\/worker\.js)$/;
const mentioned = [...new Set([...log.matchAll(/((?:scripts|motion\/src|bot)\/[\w./-]+\.(?:mjs|js|py|tsx?))/g)].map((m) => m[1]))].filter((f) => ALLOWED.test(f) && fs.existsSync(path.join(ROOT, f)));
const base = [...new Set([...mentioned, ...(wf === 'factory' ? ['scripts/auto/factory.mjs'] : [])])];
// + الملفات اللي بيستورد منها (عشان يعرف أسماء الدوال وشكلها الحقيقي)
const imports = base.flatMap((f) => [...fs.readFileSync(path.join(ROOT, f), 'utf8').matchAll(/from '(\.{1,2}\/[^']+)'/g)].map((m) => path.relative(ROOT, path.resolve(path.dirname(path.join(ROOT, f)), m[1])))).filter((f) => ALLOWED.test(f) && fs.existsSync(path.join(ROOT, f)));
const files = [...new Set([...base, ...imports])].slice(0, 7);
const playbook = fs.readFileSync(path.join(ROOT, 'REPAIR_PLAYBOOK.md'), 'utf8') + (/photo|صور/i.test(log) ? '\n\n' + fs.readFileSync(path.join(ROOT, 'PHOTO_PLAYBOOK.md'), 'utf8') : '');
// الدورة اتعملت على نسخة قديمة؟ نوري الفريق اللي اتغير بعدها (ممكن الغلطة تكون اتصلّحت خلاص)
const runSha = process.env.RUN_SHA || '';
let since = '';
if (runSha) { try { since = execFileSync('git', ['diff', runSha, 'HEAD', '--', ...files], { cwd: ROOT, encoding: 'utf8' }).slice(0, 12000); } catch {} }
const sinceTxt = since ? `\n===== اللي اتغير في الملفات دي بعد الدورة اللي وقعت (لو الغلطة اتصلّحت هنا خلاص → edits فاضية و diagnosis «اتصلّحت خلاص»):\n${since}\n` : '';
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

// 4.5) 🧠 التحقيق: الموظف بيفكّر خطوة بخطوة — بيقرا ملفات، يدوّر في الكود، يبص على البيانات وتاريخ الدورات — لحد ما يفهم السبب الجذري.
//      وكمان يقدر ياخد قرار تشغيلي آمن يفك المصنع على طول (يركن طلب عالق، يشغّل ورك فلو تاني) قبل ما يصلّح الكود.
const tool = {
  read: ({ file, from = 1, to = 200 }) => { const f = String(file).replace(/^\.?\//, ''); if (/(^|\/)\.env|secret|token|key/i.test(f)) return 'ممنوع'; const t = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n'); return t.slice(Math.max(0, from - 1), Math.min(t.length, to)).map((l, i) => `${from + i}: ${l}`).join('\n').slice(0, 15000); },
  grep: ({ pattern }) => { try { return execFileSync('grep', ['-rnE', String(pattern), 'scripts', 'motion/src', 'bot/worker.js', '.github/workflows'], { cwd: ROOT, encoding: 'utf8' }).slice(0, 8000); } catch { return '(مفيش)'; } },
  data: ({ file }) => { const f = String(file).replace(/^\.?\//, ''); if (!/^(data|queue)\/[\w.-]+\.json$/.test(f)) return 'data/*.json أو queue/*.json بس'; return fs.readFileSync(path.join(ROOT, f), 'utf8').slice(-12000); },
  ls: ({ dir }) => { const d = String(dir || '.').replace(/^\.?\//, ''); return fs.readdirSync(path.join(ROOT, d)).slice(-80).join('\n'); },
  runs: ({ workflow = 'factory.yml' }) => { try { return execFileSync('gh', ['run', 'list', '-w', String(workflow), '-L', '15', '--json', 'createdAt,conclusion,event'], { cwd: ROOT, encoding: 'utf8' }); } catch (e) { return e.message; } },
  history: () => JSON.stringify(reps.runs.slice(-15)),
};
const ops = []; // قرارات تشغيلية اتاخدت
const OPS = {
  park_request: ({ index, why }) => { const f = path.join(ROOT, 'data/requests.json'); const rq = JSON.parse(fs.readFileSync(f, 'utf8')); const r = rq[index]; if (!r || r.status !== 'pending') return 'مش موجود أو مش pending'; Object.assign(r, { status: 'parked', parkedAt: new Date().toISOString(), why }); fs.writeFileSync(f, JSON.stringify(rq, null, 1)); ops.push(`ركنت الطلب ${index}: ${why}`); return 'اتركن'; },
  rerun: ({ workflow }) => { if (!/^(factory|publish|watch)\.yml$/.test(workflow)) return 'مش مسموح'; execFileSync('gh', ['workflow', 'run', workflow], { cwd: ROOT }); ops.push(`شغّلت ${workflow}`); return 'اشتغل'; },
};
let notes = ''; const T0 = Date.now();
for (let step = 0; step < 10 && Date.now() - T0 < 8 * 60e3; step++) { // حد 8 دقايق تحقيق — بعدها يصلّح باللي فهمه
  const a = await json(`إنت موظف إصلاح ذكي في مصنع «كادر كورة» (مش بوت بقواعد). بتفكر زي مهندس: فرضية → تتأكد منها بالأدوات → سبب جذري.
${playbook.slice(0, 7000)}
===== سجل الدورة اللي وقعت (${wf}):\n${log.slice(-6000)}
===== ملاحظاتك لحد دلوقتي:\n${notes || '(لسه)'}
الأدوات (أداة واحدة كل خطوة):
- read {file,from,to}: تقرا سطور من ملف كود
- grep {pattern}: تدوّر في الكود والورك فلوز
- data {file}: تقرا data/*.json أو queue/*.json (الطلبات، سجل المصنع، التذاكر)
- ls {dir} · runs {workflow} (تاريخ الدورات) · history {} (إصلاحاتك اللي فاتت)
قرارات تشغيلية آمنة (لو حاجة واحدة عالقة موقّفة المصنع كله):
- park_request {index,why}: تركن طلب في data/requests.json بيوقّع المصنع كل مرة
- rerun {workflow}: تشغّل factory.yml/publish.yml/watch.yml
لما تفهم السبب: {"done":true,"root_cause":"..."}
رجّع JSON: {"thought":"بتفكر في إيه","tool":"read","args":{...}} أو {"done":true,"root_cause":"..."}`, { temp: 0.2 }).catch(() => ({ done: true, root_cause: '' }));
  if (a.done) { if (a.root_cause) notes += `\n🎯 السبب الجذري: ${a.root_cause}`; break; }
  let out; try { out = (tool[a.tool] || OPS[a.tool] || (() => 'أداة مش موجودة'))(a.args || {}); } catch (e) { out = `غلطة: ${e.message}`; }
  notes += `\n— ${a.thought || ''}\n  ${a.tool} ${JSON.stringify(a.args || {})} →\n${String(out).slice(0, 3000)}`;
  console.log(`🧠 ${a.thought || ''} · ${a.tool}`);
}
notes = notes.slice(-14000);

// 5) التشخيص + الإصلاح (محاولتين، التانية بتاخد نتيجة الفحص)
let feedback = '';
for (let attempt = 0; attempt < 2; attempt++) {
  const r = await json(`إنت فريق الإصلاح الدائم لمصنع فيديوهات «كادر كورة». مهمتك: تلاقي السبب الجذري للغلطة وتصلّحه بأصغر تعديل ممكن.

${playbook}

===== سجل الدورة اللي وقعت (${wf}):
${log.slice(-9000)}

===== الملفات:
${src || '(مفيش ملفات ظاهرة في الغلطة)'}
${sinceTxt}
===== تحقيقك (اللي لقيته بنفسك بالأدوات):
${notes}
${ops.length ? `\n===== قرارات تشغيلية خدتها: ${ops.join(' · ')}\n` : ''}${feedback ? `\n===== محاولتك اللي فاتت ما عدّتش الفحص:\n${feedback}\n` : ''}
رجّع JSON:
{"diagnosis":"سطرين بالمصري: الغلطة إيه وسببها","external":false,"confident":true,
 "edits":[{"file":"scripts/auto/x.mjs","find":"نص موجود في الملف بالظبط (سطر أو أكتر، فريد)","replace":"النص الجديد"}]}
- find لازم يكون منسوخ حرف بحرف من الملف وموجود مرة واحدة بس.
- الملفات المسموحة بس: scripts/ و motion/src/ و bot/worker.js. ممنوع data/ و queue/ و .github/.
- لو السبب خارجي أو مش متأكد: external=true أو confident=false و edits فاضية.`, { temp: 0.1 });
  if (r.external || !r.confident || !(r.edits || []).length) { record('diagnosed', { diagnosis: r.diagnosis, ops }); finish({ status: ops.length ? 'fixed' : 'diagnosed', message: `${r.diagnosis || 'مفيش إصلاح كود مؤكد'}${ops.length ? `\n🧯 ${ops.join(' · ')}` : ''}`, files: ops.length ? ['data/requests.json'] : [] }); }
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
${sinceTxt}
===== التعديل (diff):\n${diff.slice(0, 8000)}
افحص: (1) بيحل السبب الجذري فعلًا؟ (2) بيستخدم الدوال والمتغيرات صح حسب الملفات (مثلًا دالة لازم تتنادى بـ ()؟ خاصية موجودة فعلًا؟) (3) ما بيقفلش أو يعطّل ميزة بصمت (شرط دايمًا true/false، return بدري، catch بيبلع الغلطة) (4) ما بيكسرش قواعد الكتاب. (5) لو الغلطة كانت اتصلّحت خلاص في «اللي اتغير بعد الدورة» → approve=false. (6) ما بيغيّرش سلوك تاني شغال (توقيت، مسارات، جودة صوت).
رجّع JSON {"approve":true|false,"why":"سطر بالمصري"}`, { temp: 0 }).catch(() => ({ approve: false, why: 'المراجع ما ردّش' }));
    if (!rv.approve) errs = [`المراجع رفض: ${rv.why}`];
  }
  if (!errs.length && changed.length) { record('fixed', { files: changed, diagnosis: r.diagnosis, ops }); finish({ status: 'fixed', message: `${r.diagnosis}${ops.length ? `\n🧯 ${ops.join(' · ')}` : ''}`, files: changed }); }
  for (const [f, c] of backup) fs.writeFileSync(path.join(ROOT, f), c); // رجوع
  feedback = errs.join('\n');
}
record('failed', { feedback: feedback.slice(0, 500) });
finish({ status: 'failed', message: `ما قدرتش أصلّح بأمان (رجّعت كل حاجة): ${errLine}` });
