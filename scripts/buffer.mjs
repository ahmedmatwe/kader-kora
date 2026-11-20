// تيك توك عن طريق Buffer (تطبيق Buffer على تيك توك متوافق عليه، فالفيديو بينزل عام). API: GraphQL على https://api.buffer.com
// المفتاح: BUFFER_API_KEY (secret) — من Buffer: Settings ← API.
// 🔒 قفل أمان: بيختار قناة تيك توك اسمها kader/كادر بس — عمره ما ينشر على حكاية ترند أو سر الموبايل أو خبر يهمك حتى لو في نفس الحساب.
const NAME = /kader|كادر/i;
async function gql(key, query, variables = {}) {
  const r = await fetch('https://api.buffer.com', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ query, variables }) });
  const j = await r.json().catch(() => ({})); if (!r.ok || j.errors?.length) throw new Error(`Buffer: ${j.errors?.[0]?.message ?? `HTTP ${r.status}`}`); return j.data;
}
export async function tiktokChannel(key = process.env.BUFFER_API_KEY) {
  const { account } = await gql(key, 'query { account { organizations { id name } } }');
  const seen = [];
  for (const o of account.organizations) {
    const { channels } = await gql(key, 'query($org: OrganizationId!) { channels(input: { organizationId: $org }) { id name service } }', { org: o.id });
    for (const c of channels) { if (/tiktok/i.test(c.service)) seen.push(c.name); if (/tiktok/i.test(c.service) && NAME.test(c.name)) return { id: c.id, name: c.name, org: o.id }; }
  }
  throw new Error(`🔒 Buffer: مفيش قناة تيك توك «كادر كورة» (القنوات: ${seen.join('، ') || 'ولا واحدة'}) — النشر اتوقف`);
}
/** بيجدول فيديو تيك توك في dueAt (UTC ISO) ويرجّع id البوست في Buffer */
export async function scheduleTikTok(videoUrl, text, dueAt, key = process.env.BUFFER_API_KEY) {
  const ch = await tiktokChannel(key);
  const r = await gql(key, 'mutation($input: CreatePostInput!) { createPost(input: $input) { ... on PostActionSuccess { post { id dueAt } } ... on MutationError { message } } }',
    { input: { channelId: ch.id, text, schedulingType: 'automatic', ...(new Date(dueAt) <= new Date(Date.now() + 3 * 60e3) ? { mode: 'shareNow' } : { mode: 'customScheduled', dueAt }), assets: [{ video: { url: videoUrl, metadata: { thumbnailOffset: 1500 } } }], metadata: { tiktok: { isAiGenerated: true } } } });
  if (!r.createPost.post) throw new Error(`Buffer: ${r.createPost.message ?? 'البوست ما اتعملش'}`);
  return { id: r.createPost.post.id, channel: ch.name };
}
/** 🔒 حارس القناة (تنبيه بس، من غير مسح): بوستات على تيك توك كادر كورة مش من تذاكرنا (زي فيديوهات «سر الموبايل» اللي نزلت غلط هنا 15–18 نوفمبر).
 *  ourTexts = كابشنات تيك توك بتاعة تذاكرنا. بيرجّع البوستات الغريبة (متجدولة أو اتبعتت آخر 6 ساعات) */
export async function findIntruders(ourTexts, key = process.env.BUFFER_API_KEY) {
  const ch = await tiktokChannel(key); const n = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const mine = new Set(ourTexts.map(n));
  const { posts } = await gql(key, 'query($org: OrganizationId!, $ch: ChannelId!) { posts(first: 30, input: { organizationId: $org, filter: { channelIds: [$ch], status: [scheduled, sending, sent] }, sort: [{ field: dueAt, direction: desc }] }) { edges { node { id text status dueAt } } } }', { org: ch.org, ch: ch.id });
  return posts.edges.map((e) => e.node).filter((p) => !mine.has(n(p.text)) && (p.status !== 'sent' || Date.now() - new Date(p.dueAt) < 6 * 3600e3));
}
