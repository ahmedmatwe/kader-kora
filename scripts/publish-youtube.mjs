// فريق النشر — يوتيوب: رفع شورت (خاص + ميعاد نشر مجدول) + ترجمة عربي + تحقق بعد الرفع + تسجيل الرابط.
// node scripts/publish-youtube.mjs videos/01-salah-70 --at "2026-11-14T20:30:00+02:00"   (من غير --at = علني فورًا)
// ⚠️ ما يتشغلش غير بعد موافقة صريحة من صاحب القناة على النسخة والميعاد.
import fs from 'node:fs'; import path from 'node:path';
import { ROOT, readJson, googleAccess, addPost, posts, cairoStr } from './lib.mjs';
const dir = path.resolve(ROOT, process.argv[2]); const ai = process.argv.indexOf('--at'); const at = ai > 0 ? new Date(process.argv[ai + 1]).toISOString() : null;
const pack = readJson(path.join(dir, 'publish.json'), null); if (!pack?.youtube) throw new Error('مفيش publish.json فيه youtube');
const y = pack.youtube; const file = path.join(dir, y.file);
if (posts().some((p) => p.platform === 'youtube' && p.video === pack.id)) { console.log('✓ الفيديو ده اتنشر على يوتيوب قبل كده — مش هيترفع تاني'); process.exit(0); }
if (at && new Date(at) - Date.now() < 15 * 60e3) throw new Error('الميعاد لازم يكون بعد ربع ساعة على الأقل (وقت الرفع والمعالجة)');
const tok = await googleAccess(); const H = (x = {}) => ({ authorization: `Bearer ${tok}`, ...x });
const size = fs.statSync(file).size;
const meta = { snippet: { title: y.title, description: y.description, tags: y.tags, categoryId: '17', defaultLanguage: 'ar', defaultAudioLanguage: 'ar' }, status: { privacyStatus: at ? 'private' : 'public', ...(at ? { publishAt: at } : {}), selfDeclaredMadeForKids: false, containsSyntheticMedia: false } };
const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', { method: 'POST', headers: H({ 'content-type': 'application/json; charset=utf-8', 'x-upload-content-type': 'video/mp4', 'x-upload-content-length': String(size) }), body: JSON.stringify(meta) });
if (!init.ok) throw new Error(`بداية الرفع فشلت ${init.status}: ${(await init.text()).slice(0, 300)}`);
const up = await fetch(init.headers.get('location'), { method: 'PUT', headers: H({ 'content-type': 'video/mp4', 'content-length': String(size) }), body: fs.readFileSync(file) });
const v = await up.json(); if (!v.id) throw new Error(`الرفع فشل: ${JSON.stringify(v).slice(0, 300)}`);
console.log('✓ اترفع:', v.id);
// الترجمة العربي (أفضل مجهود — الفيديو مرفوع خلاص)
if (y.srt) {
  const b = 'kk' + Date.now();
  const body = `--${b}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ snippet: { videoId: v.id, language: 'ar', name: 'العربية' } })}\r\n--${b}\r\ncontent-type: application/octet-stream\r\n\r\n${fs.readFileSync(path.join(dir, y.srt), 'utf8')}\r\n--${b}--`;
  const cr = await fetch('https://www.googleapis.com/upload/youtube/v3/captions?part=snippet&uploadType=multipart', { method: 'POST', headers: H({ 'content-type': `multipart/related; boundary=${b}` }), body });
  console.log(cr.ok ? '✓ الترجمة اترفعت' : `⚠️ الترجمة ما اترفعتش (${cr.status}) — ارفعها يدوي من Studio`);
}
// تحقق بعد الرفع: الحالة والميعاد زي ما طلبنا؟
await new Promise((r) => setTimeout(r, 5000));
const chk = await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=status,processingDetails&id=${v.id}`, { headers: H() })).json();
const st = chk.items?.[0]?.status || {};
const ok = at ? st.privacyStatus === 'private' && st.publishAt : st.privacyStatus === 'public';
console.log(ok ? `✓ الحالة: ${st.privacyStatus}${st.publishAt ? ' — هينزل ' + cairoStr(st.publishAt) : ''}` : `⚠️ الحالة مش زي المطلوب: ${JSON.stringify(st)}`);
const url = `https://youtube.com/shorts/${v.id}`;
addPost({ platform: 'youtube', video: pack.id, id: v.id, url, publishAt: at || new Date().toISOString(), title: y.title, status: st.privacyStatus });
console.log('الرابط:', url, at ? '(هيشتغل في ميعاد النشر)' : '');
