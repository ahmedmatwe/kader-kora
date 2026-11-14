// ربط قناة يوتيوب «كادر كورة» مرة واحدة: بيفتح صفحة موافقة جوجل، تختار القناة، والتوكن يتحفظ في ~/.kader-kora/youtube.json
// node scripts/connect-youtube.mjs
import http from 'node:http'; import crypto from 'node:crypto'; import { execFile } from 'node:child_process';
import { googleClient, saveSecret } from './lib.mjs';
const SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.force-ssl', 'https://www.googleapis.com/auth/yt-analytics.readonly', 'https://www.googleapis.com/auth/youtube.readonly'];
const c = googleClient();
const verifier = crypto.randomBytes(48).toString('base64url');
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
const state = crypto.randomBytes(12).toString('hex');
const server = http.createServer();
server.listen(0, '127.0.0.1', () => {
  const redirect = `http://127.0.0.1:${server.address().port}/callback`;
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({ client_id: c.id, redirect_uri: redirect, response_type: 'code', scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent select_account', code_challenge: challenge, code_challenge_method: 'S256', state });
  console.log('بيفتح صفحة جوجل… اختار حساب/قناة «كادر كورة» ووافق.');
  execFile('open', [url]);
  server.on('request', async (req, res) => {
    const u = new URL(req.url, redirect); if (u.pathname !== '/callback') return res.end();
    if (u.searchParams.get('state') !== state) { res.end('state غلط'); return; }
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ code: u.searchParams.get('code') || '', client_id: c.id, client_secret: c.secret, redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier }) });
    const j = await r.json();
    if (!j.refresh_token) { res.end('فشل الربط'); console.error('✗', j.error, j.error_description); process.exit(1); }
    const ch = await (await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { authorization: `Bearer ${j.access_token}` } })).json();
    const name = ch.items?.[0]?.snippet?.title || '?';
    saveSecret('youtube', { refresh_token: j.refresh_token, channel: name, channelId: ch.items?.[0]?.id, at: new Date().toISOString() });
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(`<h2 dir=rtl>✓ اتربطت قناة «${name}» — ارجع للبرنامج</h2>`);
    console.log(`✓ اتربطت قناة: ${name}`); if (!/كادر|kader/i.test(name)) console.log('⚠️ اسم القناة مش «كادر كورة» — اتأكد إنك اخترت القناة الصح، ولو غلط شغّل الأمر تاني.');
    server.close(); process.exit(0);
  });
});
