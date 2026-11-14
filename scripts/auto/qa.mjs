// فريق مراجعة الفيديو النهائي (مستقل): فريمات من نص كل مشهد → فحص بالرؤية (كلام مقطوع/متداخل/عربي مكسور/احتشام/فريم فاضي).
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
import { vision } from './ai.mjs';
const FF = fs.existsSync('/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg') ? '/opt/homebrew/opt/ffmpeg-full/bin/' : '';
export async function reviewFrames(mp4, plan, dir) {
  const qd = path.join(dir, 'qa'); fs.mkdirSync(qd, { recursive: true });
  const shots = plan.scenes.map((s, i) => { const t = (s.start + s.end) / 2 + 0.6; const f = path.join(qd, `frame-${i + 1}-${s.type}.jpg`); execFileSync(`${FF}ffmpeg`, ['-loglevel', 'error', '-y', '-ss', String(t), '-i', mp4, '-frames:v', '1', '-vf', 'scale=540:-1', '-q:v', '4', f]); return f; });
  const r = await vision(`إنت فريق مراجعة الجودة النهائية في قناة «كادر كورة» (شورتس عربي). دي ${shots.length} فريمات بالترتيب من نص كل مشهد.
افحص كل فريم بصرامة: (1) أي نص مقطوع برا الشاشة أو متداخل فوق نص تاني أو فوق وش، (2) عربي مكسور أو حروف مفصولة أو اتجاه غلط، (3) أي صورة مش محتشمة، (4) فريم فاضي/أسود، (5) أرقام معكوسة.
العناصر الثابتة طبيعية ومش غلط: «كادر كورة» فوق يمين، التاريخ فوق شمال، شريط «تريند» تحتهم، المصادر تحت، والترجمة في شريط غامق تحت.
رجّع JSON {"pass":true|false,"problems":[{"frame":1,"issue":""}]}`, shots);
  fs.writeFileSync(path.join(qd, 'gate-final.json'), JSON.stringify(r, null, 1));
  return r;
}
