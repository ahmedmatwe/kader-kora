// فريق المواعيد: بيقترح أقوى ميعاد نشر لكل منصة (بتوقيت القاهرة).
// node scripts/schedule.mjs [--type news|evergreen|match-reaction] [--from ISO]
// المنطق:
//  1) قبل ما يبقى عندنا داتا: مواعيد بداية مبنية على عادات جمهور الكورة المصري (بريك الضهر، بعد الشغل، السهرة).
//  2) بعد ≥8 منشورات على المنصة: الساعات بتتعلم من data/stats.json (متوسط المشاهدات بعد 24 ساعة + استكشاف UCB).
//  3) أي ماتش مهم في data/matches.json: ما ننشرش والناس بتتفرج (من البداية لحد +115 دقيقة)، وتعليقات الماتش تنزل بعد الصافرة.
//  4) الخبر السريع (news) ما يستناش أكتر من 3 ساعات — السبق أهم من الساعة المثالية.
import path from 'node:path'; import { ROOT, readJson, cairoHour, cairoStr } from './lib.mjs';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const type = arg('--type', 'news'); const from = new Date(arg('--from', new Date().toISOString()));
const DEFAULTS = { youtube: [13, 17, 20, 22], tiktok: [14, 18, 21, 23], instagram: [13, 19, 21], facebook: [12, 18, 21] };
const MIN_SAMPLES = 8; const LEAD_MIN = 20;
const stats = readJson(path.join(ROOT, 'data/stats.json'), { posts: [] }).posts || [];
const matches = readJson(path.join(ROOT, 'data/matches.json'), []);
function learnedHours(platform) {
  const rows = stats.filter((s) => s.platform === platform && s.views24h != null);
  if (rows.length < MIN_SAMPLES) return { hours: DEFAULTS[platform], learned: false, n: rows.length };
  const by = {}; for (const r of rows) { const h = cairoHour(r.publishedAt); (by[h] ||= []).push(r.views24h); }
  const all = rows.map((r) => r.views24h); const mean = all.reduce((a, b) => a + b, 0) / all.length;
  const score = (h) => { const v = by[h] || []; const m = v.length ? v.reduce((a, b) => a + b, 0) / v.length : mean; return m + mean * Math.sqrt(2 * Math.log(rows.length) / (v.length + 1)); };
  const hours = [...new Set([...DEFAULTS[platform], ...Object.keys(by).map(Number)])].sort((a, b) => score(b) - score(a)).slice(0, 4).sort((a, b) => a - b);
  return { hours, learned: true, n: rows.length };
}
const QUIET = (t) => { const h = cairoHour(new Date(t).toISOString()); return h >= 1 && h < 10; }; // من 1 بالليل لـ10 الصبح الجمهور نايم
const busy = (t) => matches.some((m) => { const k = new Date(m.kickoff).getTime(); return t >= k - 10 * 60e3 && t <= k + 115 * 60e3; });
function next(platform) {
  const { hours, learned, n } = learnedHours(platform);
  const start = from.getTime() + LEAD_MIN * 60e3;
  if (type === 'match-reaction') {
    const m = matches.map((x) => new Date(x.kickoff).getTime()).filter((k) => k + 115 * 60e3 >= from.getTime() - 3 * 3600e3).sort((a, b) => a - b)[0];
    if (m) return { at: new Date(Math.max(start, m + 118 * 60e3)), why: 'بعد صافرة النهاية على طول (أعلى بحث عن الماتش)', learned, n };
  }
  for (let t = Math.ceil(start / 900e3) * 900e3; t < start + 3 * 86400e3; t += 900e3) {
    const d = new Date(t); if (d.getUTCMinutes() !== 30 && d.getUTCMinutes() !== 0) continue;
    const h = cairoHour(d.toISOString()); const mm = d.getUTCMinutes();
    if (!hours.includes(h) || mm !== 30 || busy(t)) continue; // :30 بالظبط (قبل ذروة الساعة)
    if (type === 'news' && t - start > 3 * 3600e3) break;
    return { at: d, why: learned ? `أقوى ساعة من داتا ${n} منشور` : 'ميعاد بداية (لسه مفيش داتا كفاية)', learned, n };
  }
  let t = start; while (busy(t) || QUIET(t)) t += 15 * 60e3; // خبر سريع ومفيش ميعاد مثالي قريب → انشر بدري بعد الماتش لو فيه
  return { at: new Date(t), why: 'خبر سريع — أقرب وقت مناسب', learned, n };
}
const out = Object.fromEntries(Object.keys(DEFAULTS).map((p) => [p, next(p)]));
for (const [p, r] of Object.entries(out)) console.log(`${p.padEnd(9)} ${cairoStr(r.at.toISOString())}  — ${r.why}`);
console.log(JSON.stringify(Object.fromEntries(Object.entries(out).map(([p, r]) => [p, r.at.toISOString()]))));
