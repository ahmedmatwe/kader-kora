// فيسبوك ريلز + إنستجرام ريلز (Graph API) — منقول من كود سر البراند الشغال.
// المفاتيح: META_PAGE_TOKEN / META_PAGE_ID / META_IG_USER_ID (secrets على السحابة، أو ~/.kader-kora/meta.json على الماك)
import fs from 'node:fs'; import { secret } from './lib.mjs';
const V = 'v27.0'; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function metaCreds() {
  if (process.env.META_PAGE_TOKEN) return { token: process.env.META_PAGE_TOKEN, pageId: process.env.META_PAGE_ID, igId: process.env.META_IG_USER_ID };
  const s = secret('meta'); if (!s?.token) throw new Error('فيسبوك/إنستجرام مش متربطين'); return s;
}
async function graph(c, p, params = {}, method = 'POST') {
  const url = `https://graph.facebook.com/${V}/${p}`; const body = new URLSearchParams({ ...params, access_token: c.token });
  const res = method === 'GET' ? await fetch(`${url}?${body}`) : await fetch(url, { method, body });
  const j = await res.json().catch(() => ({})); if (!res.ok || j.error) throw new Error(`Meta ${p}: ${j.error?.message ?? res.status}`); return j;
}
async function rupload(c, uri, file) {
  const data = fs.readFileSync(file);
  const res = await fetch(uri, { method: 'POST', headers: { authorization: `OAuth ${c.token}`, offset: '0', file_size: String(data.length), 'content-type': 'application/octet-stream' }, body: data });
  const j = await res.json().catch(() => ({})); if (!res.ok || j.success === false || j.error) throw new Error(`Meta upload: ${j.error?.message ?? j.debug_info?.message ?? res.status}`);
}
export async function check(c = metaCreds()) {
  const p = await graph(c, c.pageId, { fields: 'name,link,instagram_business_account{username}' }, 'GET');
  return { page: p.name, link: p.link, instagram: p.instagram_business_account?.username };
}
// قفل أمان: ممنوع ننشر على أي صفحة غير «كادر كورة» (عشان ما يحصلش خلط مع سر الموبايل أو غيرها)
let verified = false;
export async function guard(c = metaCreds()) {
  if (verified) return;
  const p = await graph(c, c.pageId, { fields: 'name,instagram_business_account{username}' }, 'GET');
  const ig = p.instagram_business_account?.username || '';
  if (!/كادر\s*كور|kader/i.test(p.name) || (c.igId && c.igId !== '-' && !/kader/i.test(ig))) throw new Error(`🔒 قفل الأمان: المفتاح ده لصفحة «${p.name}» / @${ig} مش كادر كورة — النشر اتوقف`);
  verified = true;
}
export async function facebookReel(file, description, c = metaCreds()) {
  await guard(c);
  const st = await graph(c, `${c.pageId}/video_reels`, { upload_phase: 'start' });
  await rupload(c, st.upload_url ?? `https://rupload.facebook.com/video-upload/${V}/${st.video_id}`, file);
  await graph(c, `${c.pageId}/video_reels`, { upload_phase: 'finish', video_id: st.video_id, video_state: 'PUBLISHED', description });
  return { id: String(st.video_id), url: `https://www.facebook.com/reel/${st.video_id}` };
}
// إنستجرام: الرفع المباشر بيفشل للحساب الجديد لو الفيديو > ~30 ث، فبنستخدم رابط عام (ريبو kader-kora-media) لو موجود.
export async function instagramReel(file, caption, coverMs = 1500, c = metaCreds(), videoUrl = '') {
  await guard(c);
  for (let i = 0; ; i++) {
    try {
      const base = { media_type: 'REELS', caption, share_to_feed: 'true', thumb_offset: String(coverMs) };
      const k = await graph(c, `${c.igId}/media`, videoUrl ? { ...base, video_url: videoUrl } : { ...base, upload_type: 'resumable' });
      if (!videoUrl) await rupload(c, k.uri, file);
      for (let n = 0; n < 60; n++) {
        const s = await graph(c, String(k.id), { fields: 'status_code,status' }, 'GET');
        if (s.status_code === 'FINISHED') break;
        if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`Instagram processing failed: ${s.status ?? s.status_code}`);
        await sleep(10000);
      }
      const p = await graph(c, `${c.igId}/media_publish`, { creation_id: String(k.id) });
      const m = await graph(c, String(p.id), { fields: 'permalink' }, 'GET').catch(() => ({}));
      return { id: String(p.id), url: m.permalink || `https://www.instagram.com/kader_kora/` };
    } catch (e) { if (i >= 2 || !/processing failed|ProcessingFailed/i.test(e.message)) throw e; await sleep(15000); }
  }
}
export async function stats(platform, id, c = metaCreds()) {
  if (platform === 'facebook') { const b = await graph(c, id, { fields: 'views,likes.summary(true).limit(0),comments.summary(true).limit(0)' }, 'GET').catch(() => ({})); return { views: +b.views || 0, likes: b.likes?.summary?.total_count, comments: b.comments?.summary?.total_count }; }
  const b = await graph(c, id, { fields: 'like_count,comments_count' }, 'GET'); const ins = await graph(c, `${id}/insights`, { metric: 'views,shares,saved,reach' }, 'GET').catch(() => null);
  const g = (n) => ins?.data?.find((d) => d.name === n)?.values?.[0]?.value; return { views: g('views') ?? 0, likes: b.like_count, comments: b.comments_count, shares: g('shares'), saves: g('saved') };
}
