// 🤖 بوت تليجرام «كادر كورة» — إيجنت بيفهم كلامك بالمصري وينفّذ في المشروع (ريبو ahmedmatwe/kader-kora).
// بيسمع من صاحب القناة بس (CHAT_ID). أي حاجة بتحذف أو بتنشر أو بتغيّر إعداد مهم بتستنى زرار تأكيد.
// شغال على Cloudflare (من غير الماك). المفاتيح كلها secrets في Cloudflare.
const REPO = 'ahmedmatwe/kader-kora';
const GH = 'https://api.github.com';
const TZ = 'Africa/Cairo';
const cairo = (iso) => new Date(iso).toLocaleString('ar-EG', { timeZone: TZ, weekday: 'short', hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' });

// ───────── تليجرام
async function tg(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return r.json().catch(() => ({}));
}
const say = (env, text, extra = {}) => tg(env, 'sendMessage', { chat_id: env.CHAT_ID, text: text.slice(0, 4000), ...extra });

// ───────── GitHub (ملفات المشروع)
const ghH = (env) => ({ authorization: `Bearer ${env.GH_TOKEN}`, 'user-agent': 'kader-kora-bot', accept: 'application/vnd.github+json' });
const b64d = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, '')), (c) => c.charCodeAt(0)));
const b64e = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
async function getFile(env, p) {
  const r = await fetch(`${GH}/repos/${REPO}/contents/${encodeURI(p)}`, { headers: ghH(env) });
  if (r.status === 404) return { text: null, sha: null };
  const j = await r.json(); return { text: b64d(j.content || ''), sha: j.sha };
}
async function getJson(env, p, d) { const f = await getFile(env, p); try { return { data: f.text ? JSON.parse(f.text) : d, sha: f.sha }; } catch { return { data: d, sha: f.sha }; } }
async function putJson(env, p, mutate, msg, d = {}) {
  for (let i = 0; i < 4; i++) {
    const { data, sha } = await getJson(env, p, d); const next = await mutate(data);
    const r = await fetch(`${GH}/repos/${REPO}/contents/${encodeURI(p)}`, { method: 'PUT', headers: ghH(env), body: JSON.stringify({ message: `🤖 ${msg}`, content: b64e(JSON.stringify(next, null, 1) + '\n'), ...(sha ? { sha } : {}) }) });
    if (r.ok) return next; if (r.status !== 409 && r.status !== 422) throw new Error(`GitHub ${r.status}`);
  }
  throw new Error('GitHub: تعارض، جرب تاني');
}
async function listDir(env, p) { const r = await fetch(`${GH}/repos/${REPO}/contents/${encodeURI(p)}`, { headers: ghH(env) }); return r.ok ? r.json() : []; }
async function tickets(env) {
  const files = (await listDir(env, 'queue')).filter((f) => f.name.endsWith('.json'));
  return Promise.all(files.map(async (f) => ({ ...(await getJson(env, f.path, {})).data, _path: f.path })));
}
async function dispatch(env, wf, inputs) { const r = await fetch(`${GH}/repos/${REPO}/actions/workflows/${wf}/dispatches`, { method: 'POST', headers: ghH(env), body: JSON.stringify({ ref: 'main', ...(inputs ? { inputs } : {}) }) }); return r.status === 204; }

// ───────── المنصات
async function googleToken(env) {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: env.YT_REFRESH_TOKEN, grant_type: 'refresh_token' }) });
  return (await r.json()).access_token;
}
const graph = async (env, p, q = {}, method = 'GET') => { const u = new URL(`https://graph.facebook.com/v27.0/${p}`); const body = new URLSearchParams({ ...q, access_token: env.META_PAGE_TOKEN }); const r = method === 'GET' ? await fetch(`${u}?${body}`) : await fetch(u, { method, body }); return r.json(); };

// ───────── الأدوات (اللي الإيجنت يقدر يعمله)
const SAFE_SETTINGS = ['dailyTarget', 'youtubeDaily', 'enabled', 'autoApprove', 'platforms'];
const TOOLS = {
  async queue_status(env) {
    const T = await tickets(env); const now = Date.now();
    const rows = T.map((t) => ({ id: t.id, topic: t.topic, approved: !!t.approved, platforms: Object.fromEntries(Object.entries(t.platforms || {}).map(([p, j]) => [p, { status: j.status, at: j.at && cairo(j.at), url: j.url }])) }));
    return { waiting_approval: rows.filter((r) => !r.approved).length, total: rows.length, videos: rows.slice(-25), now: cairo(new Date(now).toISOString()) };
  },
  async unpublished(env) {
    const T = await tickets(env);
    return T.filter((t) => Object.values(t.platforms || {}).some((j) => !['published', 'scheduled'].includes(j.status))).map((t) => ({ id: t.id, topic: t.topic, approved: !!t.approved, pending: Object.entries(t.platforms).filter(([, j]) => !['published', 'scheduled'].includes(j.status)).map(([p, j]) => `${p} ${j.status}${j.at ? ` ${cairo(j.at)}` : ''}`) }));
  },
  async followers(env) {
    const out = {};
    try { const tok = await googleToken(env); const j = await (await fetch('https://www.googleapis.com/youtube/v3/channels?part=statistics&mine=true', { headers: { authorization: `Bearer ${tok}` } })).json(); const s = j.items?.[0]?.statistics; out.youtube = { subscribers: +s.subscriberCount, views: +s.viewCount, videos: +s.videoCount }; } catch (e) { out.youtube = { error: String(e.message) }; }
    try { const p = await graph(env, env.META_PAGE_ID, { fields: 'followers_count,fan_count' }); out.facebook = { followers: p.followers_count ?? p.fan_count }; } catch (e) { out.facebook = { error: String(e.message) }; }
    try { const i = await graph(env, env.META_IG_USER_ID, { fields: 'followers_count,media_count' }); out.instagram = { followers: i.followers_count, posts: i.media_count }; } catch (e) { out.instagram = { error: String(e.message) }; }
    out.tiktok = { note: 'تيك توك لسه مش متربط بالـAPI (محتاج مفتاح Buffer) — الأرقام من التطبيق نفسه' };
    return out;
  },
  async video_stats(env) {
    const { data } = await getJson(env, 'data/stats.json', { posts: [] });
    return (data.posts || []).slice(-30).map((r) => ({ platform: r.platform, video: r.video, views: r.views ?? r.views24h, likes: r.likes, comments: r.comments, watched_pct: r.avgViewPct && Math.round(r.avgViewPct), at: r.publishedAt && cairo(r.publishedAt) }));
  },
  async factory_log(env) {
    const { data } = await getJson(env, 'data/factory.json', { runs: [] });
    return (data.runs || []).slice(-8).map((r) => ({ at: cairo(r.at), status: r.status, id: r.id, topic: r.topic, last: (r.log || []).slice(-3) }));
  },
  async settings(env) { return (await getJson(env, 'data/config.json', {})).data; },
  async now_working(env) {
    const live = JSON.parse((await env.MEM.get('live')) || 'null');
    const runs = await (await fetch(`${GH}/repos/${REPO}/actions/runs?status=in_progress&per_page=5`, { headers: ghH(env) })).json();
    const running = (runs.workflow_runs || []).map((r) => ({ workflow: r.name, since: cairo(r.run_started_at) }));
    const { data } = await getJson(env, 'data/factory.json', { runs: [] }); const last = (data.runs || []).at(-1);
    return { running_now: running, live_stage: live && { topic: live.topic, stage: live.stage, video: live.id, updated: cairo(live.at) }, last_finished: last && { at: cairo(last.at), status: last.status, topic: last.topic } };
  },
  async run_workflow(env, { name }) { const ok = ['factory', 'publish', 'stats', 'comments'].includes(name) && await dispatch(env, `${name}.yml`); return { ok }; },
  async dev_request(env, { text }) {
    const r = await fetch(`${GH}/repos/${REPO}/issues`, { method: 'POST', headers: ghH(env), body: JSON.stringify({ title: `طلب تطوير: ${text.slice(0, 80)}`, body: `طلب صاحب القناة من تليجرام (${cairo(new Date().toISOString())}):\n\n${text}`, labels: ['طلب'] }) });
    return r.ok ? { ok: true, note: 'اتسجل طلب تطوير — هيتنفذ في جلسة التطوير' } : { error: `GitHub ${r.status}` };
  },
  async add_topic(env, { text }) {
    await putJson(env, 'data/requests.json', (d) => [...(Array.isArray(d) ? d : []), { at: new Date().toISOString(), text, status: 'pending' }], `موضوع جديد: ${text}`, []);
    return { ok: true, note: 'اتضاف — المصنع هياخده أول ما يدوّر على قصة (لازم يلاقيه في جريدتين كبار على الأقل)' };
  },
  async run_factory(env) { return { ok: await dispatch(env, 'factory.yml') }; },
  async read_file(env, { path }) { const f = await getFile(env, path); return f.text == null ? { error: 'مش موجود' } : { text: f.text.slice(0, 6000) }; },
  // ↓ دول بيستنوا تأكيد بزرار
  async approve(env, { id }) { await editTicket(env, id, (t) => ({ ...t, approved: true, approvedBy: `صاحب القناة على تليجرام ${new Date().toISOString()}` }), `موافقة على ${id}`); return { ok: true }; },
  async cancel(env, { id }) { await editTicket(env, id, (t) => ({ ...t, approved: false, approvedBy: null, cancelled: new Date().toISOString(), platforms: Object.fromEntries(Object.entries(t.platforms).map(([p, j]) => [p, ['published', 'scheduled'].includes(j.status) ? j : { ...j, status: 'cancelled' }])) }), `إلغاء ${id}`); return { ok: true }; },
  async reschedule(env, { id, platform, at }) { await editTicket(env, id, (t) => { t.platforms[platform] = { ...t.platforms[platform], at: new Date(at).toISOString(), status: 'pending' }; return t; }, `ميعاد جديد ${id}/${platform}`); return { ok: true }; },
  async delete_video(env, { id, platforms }) {
    const T = await tickets(env); const t = T.find((x) => x.id === id); if (!t) return { error: 'مش لاقي الفيديو' };
    const res = {};
    for (const p of platforms || Object.keys(t.platforms)) {
      const j = t.platforms[p]; if (!j?.id && !j?.url) { res[p] = 'مش منشور'; continue; }
      try {
        if (p === 'youtube') { const vid = j.id || (j.url.match(/shorts\/([\w-]+)/) || [])[1]; const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?id=${vid}`, { method: 'DELETE', headers: { authorization: `Bearer ${await googleToken(env)}` } }); res[p] = r.status === 204 ? 'اتمسح' : `فشل ${r.status}`; }
        else if (p === 'facebook') { const r = await graph(env, j.id, {}, 'DELETE'); res[p] = r.success ? 'اتمسح' : JSON.stringify(r.error?.message); }
        else res[p] = 'إنستجرام/تيك توك مش بيسمحوا بالمسح من الـAPI — امسحه من التطبيق';
      } catch (e) { res[p] = String(e.message); }
    }
    await editTicket(env, id, (x) => { for (const p of Object.keys(res)) if (res[p] === 'اتمسح') x.platforms[p] = { ...x.platforms[p], status: 'deleted' }; return x; }, `مسح ${id}`);
    return res;
  },
  async set_setting(env, { key, value }) {
    if (!SAFE_SETTINGS.includes(key)) return { error: `الإعداد ده مش مسموح (${SAFE_SETTINGS.join('، ')})` };
    const v = typeof value === 'string' && /^(true|false|\d+)$/.test(value) ? JSON.parse(value) : value;
    const next = await putJson(env, 'data/config.json', (c) => ({ ...c, [key]: v, ...(key === 'autoApprove' && v ? { approvedBy: `صاحب القناة على تليجرام ${new Date().toISOString()}` } : {}) }), `إعداد ${key}=${JSON.stringify(v)}`);
    return { ok: true, settings: next };
  },
};
async function editTicket(env, id, fn, msg) { const T = await tickets(env); const t = T.find((x) => x.id === id || x.id.startsWith(id)); if (!t) throw new Error(`مش لاقي فيديو ${id}`); await putJson(env, t._path, (d) => fn(d), msg); }
const CONFIRM = new Set(['approve', 'cancel', 'reschedule', 'delete_video', 'set_setting']);

const DECL = [
  ['now_working', 'المصنع شغال على إيه دلوقتي: الموضوع والمرحلة اللحظية، وآخر فيديو خلص', {}],
  ['run_workflow', 'تشغيل حاجة على السحابة دلوقتي: factory (فيديو جديد) أو publish (نشر اللي عليه الدور) أو stats (تحديث الأرقام) أو comments (الرد على الكومنتات)', { name: 'string' }],
  ['dev_request', 'تسجيل طلب لصاحب القناة محتاج تعديل في الكود/طريقة الشغل (أي حاجة الأدوات مش بتعملها) عشان يتنفذ في جلسة التطوير', { text: 'string' }],
  ['queue_status', 'حالة كل الفيديوهات في الطابور (مستنية موافقة/متجدولة/منشورة) ومواعيدها', {}],
  ['unpublished', 'الفيديوهات اللي لسه ما اتنشرتش على منصة أو أكتر', {}],
  ['followers', 'عدد المتابعين/المشتركين على يوتيوب وفيسبوك وإنستجرام (وتيك توك لو متاح)', {}],
  ['video_stats', 'مشاهدات ولايكات وكومنتات ونسبة المشاهدة لآخر المنشورات', {}],
  ['factory_log', 'آخر دورات المصنع: عمل إيه ووقف ليه', {}],
  ['settings', 'إعدادات المصنع الحالية (عدد الفيديوهات في اليوم، شغال ولا لأ، الموافقة التلقائية، المنصات)', {}],
  ['add_topic', 'إضافة موضوع/فكرة فيديو يطلبه صاحب القناة', { text: 'string' }],
  ['run_factory', 'تشغيل دورة إنتاج فيديو دلوقتي', {}],
  ['read_file', 'قراءة أي ملف في المشروع (مثلا videos/<id>/script.json أو sources.md) للإجابة عن سؤال', { path: 'string' }],
  ['approve', 'الموافقة على نشر فيديو (id)', { id: 'string' }],
  ['cancel', 'إلغاء نشر فيديو لسه ما اتنشرش', { id: 'string' }],
  ['reschedule', 'تغيير ميعاد نشر فيديو على منصة (at بصيغة ISO بتوقيت القاهرة +02:00)', { id: 'string', platform: 'string', at: 'string' }],
  ['delete_video', 'مسح فيديو منشور من منصة أو أكتر (youtube/facebook)', { id: 'string', platforms: 'array' }],
  ['set_setting', `تغيير إعداد في المصنع: ${SAFE_SETTINGS.join('، ')}`, { key: 'string', value: 'string' }],
].map(([name, description, props]) => ({ name, description, parameters: { type: 'OBJECT', properties: Object.fromEntries(Object.entries(props).map(([k, t]) => [k, t === 'array' ? { type: 'ARRAY', items: { type: 'STRING' } } : { type: 'STRING' }])), required: Object.keys(props) } }));

const SYSTEM = `إنت «مساعد كادر كورة» — المدير التنفيذي لمصنع شورتس كورة مصرية، وبتكلم صاحب القناة على تليجرام.
- اتكلم بالمصري، ودود وقصير وواضح (أرقام وحالات، من غير رغي). من غير ماركداون معقد.
- افهم المقصود حتى لو الكلام مختصر أو فيه أخطاء، واستخدم الأدوات تجيب الداتا الحقيقية — عمرك ما تخترع رقم أو حالة.
- أي طلب تنفيذ (نشر، إلغاء، مسح، ميعاد، إعداد) نفّذه بالأداة المناسبة — هيظهر لصاحب القناة زرار تأكيد.
- «شغالين في إيه» → now_working وقول الموضوع والمرحلة بالظبط.
- لو الطلب مش متاح بالأدوات (تعديل في طريقة الشغل، شكل الفيديو، فريق جديد...): سجّله بـdev_request وقول إنه اتسجل وهيتنفذ في جلسة التطوير. لو فكرة فيديو → add_topic.
- ما ترفضش أي طلب من غير ما تحاول بالأدوات أو تسجّله.
- قواعد القناة ثابتة: مصادر من الجرايد المصرية الكبيرة بس، مفيش شائعات، صور محتشمة بس.
- الوقت بتوقيت القاهرة.`;

// ───────── Gemini (مفاتيح كادر كورة بس)
async function gemini(env, contents) {
  const keys = (env.GEMINI_API_KEY || '').split(',').map((k) => k.trim()).filter(Boolean);
  let last = '';
  for (const m of ['gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.5-flash-lite']) for (const k of keys) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': k }, body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents, tools: [{ functionDeclarations: DECL }], generationConfig: { temperature: 0.3 } }) });
    const j = await r.json().catch(() => ({})); const c = j.candidates?.[0]?.content;
    if (r.ok && c) return c; last = `${m} ${r.status}`;
  }
  throw new Error(`Gemini: ${last}`);
}

async function agent(env, text) {
  const hist = JSON.parse((await env.MEM.get('hist')) || '[]').slice(-12);
  const contents = [...hist, { role: 'user', parts: [{ text }] }];
  for (let step = 0; step < 6; step++) {
    const c = await gemini(env, contents); contents.push(c);
    const calls = (c.parts || []).filter((p) => p.functionCall);
    if (!calls.length) {
      const answer = (c.parts || []).map((p) => p.text || '').join('').trim() || 'تمام 👍';
      await env.MEM.put('hist', JSON.stringify(contents.filter((x) => x.parts?.some((p) => p.text)).slice(-12).map((x) => ({ role: x.role, parts: x.parts.filter((p) => p.text) }))));
      return say(env, answer);
    }
    const responses = [];
    for (const { functionCall: f } of calls) {
      let result;
      if (CONFIRM.has(f.name)) {
        const n = crypto.randomUUID().slice(0, 8); await env.MEM.put(`c:${n}`, JSON.stringify(f), { expirationTtl: 3600 });
        await say(env, `محتاج تأكيدك: ${describe(f)}`, { reply_markup: { inline_keyboard: [[{ text: '✅ نفّذ', callback_data: `y:${n}` }, { text: '✖️ لأ', callback_data: `n:${n}` }]] } });
        result = { status: 'مستني تأكيد صاحب القناة بالزرار — قوله إن الزرار ظهر' };
      } else { try { result = await TOOLS[f.name](env, f.args || {}); } catch (e) { result = { error: String(e.message) }; } }
      responses.push({ functionResponse: { name: f.name, response: { result } } });
    }
    contents.push({ role: 'user', parts: responses });
  }
  return say(env, 'الطلب طويل شوية — قولهولي تاني بشكل أبسط 🙏');
}
const describe = (f) => { const a = f.args || {}; return ({ approve: `نشر الفيديو ${a.id}`, cancel: `إلغاء نشر ${a.id}`, reschedule: `ميعاد ${a.id} على ${a.platform} يبقى ${a.at && cairo(a.at)}`, delete_video: `مسح ${a.id} من ${(a.platforms || ['كل المنصات']).join('، ')} (مش هيرجع)`, set_setting: `${a.key} = ${a.value}` })[f.name] || f.name; };

// ───────── الأزرار (موافقة/إلغاء — من رسائل المصنع أو من التأكيدات)
async function onButton(env, q) {
  const [kind, n] = q.data.split(':'); let msg = '';
  if (kind === 'y' || kind === 'n') {
    const f = JSON.parse((await env.MEM.get(`c:${n}`)) || 'null');
    if (!f) msg = 'التأكيد ده انتهى — قولّي تاني';
    else if (kind === 'n') { msg = 'تمام، مش هنعمل حاجة'; await env.MEM.delete(`c:${n}`); }
    else { try { const r = await TOOLS[f.name](env, f.args || {}); msg = `✅ اتنفّذ: ${describe(f)}${f.name === 'delete_video' ? `\n${Object.entries(r).map(([p, s]) => `${p}: ${s}`).join('\n')}` : ''}`; } catch (e) { msg = `✗ ما اتنفّذش: ${e.message}`; } await env.MEM.delete(`c:${n}`); }
  } else if (kind === 'ok' || kind === 'no') { // أزرار رسالة الفيديو الجاهز
    try { await TOOLS[kind === 'ok' ? 'approve' : 'cancel'](env, { id: n }); msg = kind === 'ok' ? `✅ ${n} هيتنشر في مواعيده` : `🗑️ ${n} اتلغى`; } catch (e) { msg = `✗ ${e.message}`; }
  }
  await tg(env, 'answerCallbackQuery', { callback_query_id: q.id });
  await tg(env, 'editMessageReplyMarkup', { chat_id: env.CHAT_ID, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } });
  return say(env, msg);
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === '/setup' && req.headers.get('authorization') === `Bearer ${env.INGEST_SECRET}`) {
      const r = await tg(env, 'setWebhook', { url: `${url.origin}/tg`, secret_token: env.WEBHOOK_SECRET, allowed_updates: ['message', 'callback_query'] });
      return Response.json(r);
    }
    if (url.pathname === '/ingest' && req.method === 'POST' && req.headers.get('authorization') === `Bearer ${env.INGEST_SECRET}`) {
      const b = await req.json(); if (b.live) await env.MEM.put('live', JSON.stringify({ ...b.live, at: new Date().toISOString() }), { expirationTtl: 7200 });
      return Response.json({ ok: true });
    }
    if (url.pathname !== '/tg' || req.headers.get('x-telegram-bot-api-secret-token') !== env.WEBHOOK_SECRET) return new Response('kader-kora-bot');
    const u = await req.json();
    const chat = String(u.message?.chat?.id ?? u.callback_query?.message?.chat?.id ?? '');
    if (chat !== String(env.CHAT_ID)) return new Response('ok'); // صاحب القناة بس
    const uid = String(u.update_id); if (await env.MEM.get(`u:${uid}`)) return new Response('ok'); // تليجرام ساعات بيعيد نفس الرسالة
    await env.MEM.put(`u:${uid}`, '1', { expirationTtl: 3600 });
    try {
      if (u.callback_query) await onButton(env, u.callback_query);
      else {
        const text = u.message?.text?.trim();
        if (text === '/start') await say(env, 'أهلا يا كابتن 👋 أنا مساعد «كادر كورة». اسألني عن أي حاجة (شغالين في إيه، المتابعين، النتايج، اللي مستني نشر) أو قولّي أعمل إيه.');
        else if (text) { await tg(env, 'sendChatAction', { chat_id: env.CHAT_ID, action: 'typing' }); await agent(env, text); }
      }
    } catch (e) { console.log('ERR', e.stack || e); await say(env, `حصلت مشكلة: ${String(e.message).slice(0, 200)}`); }
    return new Response('ok');
  },
};
