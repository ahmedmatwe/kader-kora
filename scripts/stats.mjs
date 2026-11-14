// فريق الإحصائيات: بيجمع أرقام كل منشور ويطلع تقرير + بيغذي فريق المواعيد (data/stats.json).
// node scripts/stats.mjs            ← يسحب أرقام يوتيوب أوتوماتيك + يطبع التقرير
// node scripts/stats.mjs add tiktok <video-id> <views24h> [likes] [comments] [shares]   ← إدخال يدوي للمنصات اللي لسه مش متربطة
import path from 'node:path'; import { ROOT, readJson, writeJson, posts, googleAccess, secret, cairoStr, cairoHour } from './lib.mjs';
const P = path.join(ROOT, 'data/stats.json'); const db = readJson(P, { posts: [] });
const upsert = (row) => { const i = db.posts.findIndex((x) => x.platform === row.platform && x.id === row.id); if (i >= 0) db.posts[i] = { ...db.posts[i], ...row }; else db.posts.push(row); };
const [cmd, ...a] = process.argv.slice(2);
if (cmd === 'add') {
  const [platform, video, views24h, likes, comments, shares] = a; const led = posts().find((p) => p.platform === platform && p.video === video);
  upsert({ platform, id: led?.id || video, video, publishedAt: led?.publishAt || new Date().toISOString(), views24h: Number(views24h), likes: Number(likes || 0), comments: Number(comments || 0), shares: Number(shares || 0), source: 'manual' });
  writeJson(P, db); console.log('✓ اتسجل'); process.exit(0);
}
// يوتيوب: مشاهدات/لايكات/كومنتات + نسبة المشاهدة ومتوسط المدة من YouTube Analytics
const yt = posts().filter((p) => p.platform === 'youtube');
if (yt.length && secret('youtube')) {
  const tok = await googleAccess(); const H = { authorization: `Bearer ${tok}` };
  const v = await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics,status&id=${yt.map((p) => p.id).join(',')}`, { headers: H })).json();
  const today = new Date().toISOString().slice(0, 10);
  for (const it of v.items || []) {
    const led = yt.find((p) => p.id === it.id); const s = it.statistics; const age = (Date.now() - new Date(led.publishAt)) / 3600e3;
    const row = { platform: 'youtube', id: it.id, video: led.video, publishedAt: led.publishAt, views: +s.viewCount || 0, likes: +s.likeCount || 0, comments: +s.commentCount || 0, status: it.status.privacyStatus, updatedAt: new Date().toISOString() };
    const old = db.posts.find((x) => x.platform === 'youtube' && x.id === it.id);
    if (age >= 24 && old?.views24h == null) row.views24h = row.views; // أول قراءة بعد 24 ساعة = رقم المقارنة بين المواعيد
    const an = await (await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=2026-01-01&endDate=${today}&metrics=averageViewPercentage,averageViewDuration,subscribersGained&filters=video==${it.id}`, { headers: H })).json();
    const r = an.rows?.[0]; if (r) Object.assign(row, { avgViewPct: r[0], avgViewSec: r[1], subsGained: r[2] });
    upsert(row);
  }
  writeJson(P, db);
} else console.log('ℹ️ يوتيوب لسه مش متربط أو مفيش منشورات — التقرير من الداتا المسجلة بس');
// التقرير
if (!db.posts.length) { console.log('مفيش داتا لسه. أول تقرير بعد أول منشور بـ24 ساعة.'); process.exit(0); }
console.log('\n📊 تقرير الأداء'); for (const r of [...db.posts].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)))
  console.log(`${r.platform.padEnd(9)} ${r.video.padEnd(16)} ${cairoStr(r.publishedAt)} | مشاهدات ${r.views ?? r.views24h ?? '-'}${r.avgViewPct != null ? ` | بيتفرج ${Math.round(r.avgViewPct)}%` : ''} | لايك ${r.likes ?? '-'} | كومنت ${r.comments ?? '-'}`);
const byHour = {}; for (const r of db.posts.filter((x) => x.views24h != null)) (byHour[`${r.platform} ${cairoHour(r.publishedAt)}:00`] ||= []).push(r.views24h);
if (Object.keys(byHour).length) { console.log('\n⏰ متوسط المشاهدات أول 24 ساعة حسب ساعة النشر:'); for (const [k, v] of Object.entries(byHour).sort()) console.log(`  ${k}  →  ${Math.round(v.reduce((a, b) => a + b, 0) / v.length)} (${v.length} منشور)`); }
const low = db.posts.filter((r) => r.avgViewPct != null && r.avgViewPct < 60);
if (low.length) console.log(`\n💡 لفريق السيناريو والموشن: ${low.length} فيديو نسبة المشاهدة فيه أقل من 60% — الافتتاحية محتاجة تبقى أسرع وأقصر.`);
