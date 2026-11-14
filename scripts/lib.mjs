// أدوات مشتركة لفريق النشر والإحصائيات. المفاتيح بتتحفظ برا المشروع في ~/.kader-kora (صلاحية 600).
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { fileURLToPath } from 'node:url';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SECRETS = path.join(os.homedir(), '.kader-kora');
// البيانات الخاصة (طابور/سجلات/إحصائيات/فيديوهات) في ريبو خاص، متركّب في .data و data/queue/videos روابط ليه
export const DATA_REPO = 'ahmedmatwe/kader-kora-data';
export const DATA_DIR = path.join(ROOT, '.data');
export const dataEnv = () => ({ ...process.env, GH_TOKEN: process.env.DATA_TOKEN || process.env.GH_TOKEN || '' });
export const TZ = 'Africa/Cairo';

export function readJson(p, def) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return def; } }
export function writeJson(p, v) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 1)); }
export function secret(name) {
  if (name === 'youtube' && process.env.YT_REFRESH_TOKEN) return { refresh_token: process.env.YT_REFRESH_TOKEN };
  return readJson(path.join(SECRETS, `${name}.json`), null);
}
export function saveSecret(name, v) { fs.mkdirSync(SECRETS, { recursive: true, mode: 0o700 }); const p = path.join(SECRETS, `${name}.json`); fs.writeFileSync(p, JSON.stringify(v)); fs.chmodSync(p, 0o600); }

/** عميل OAuth بتاع جوجل (نفس مشروع Google Cloud بتاع سر البراند — بنقراه من .env القديم) */
export function googleClient() {
  if (process.env.GOOGLE_CLIENT_ID) return { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET };
  // ملف عميل OAuth (نوع Desktop) من Google Cloud — نفس مشروع سر البراند
  const dl = path.join(os.homedir(), 'Downloads');
  const f = fs.readdirSync(dl).filter((x) => /^client_secret_.*\.json$/.test(x)).map((x) => path.join(dl, x))[0];
  if (!f) throw new Error('مفيش ملف client_secret_*.json في Downloads');
  const j = JSON.parse(fs.readFileSync(f, 'utf8')); const c = j.installed || j.web;
  return { id: c.client_id, secret: c.client_secret };
}
export async function googleAccess() {
  const t = secret('youtube'); if (!t?.refresh_token) throw new Error('يوتيوب مش متربط — شغّل: node scripts/connect-youtube.mjs');
  const c = googleClient();
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ client_id: c.id, client_secret: c.secret, refresh_token: t.refresh_token, grant_type: 'refresh_token' }) });
  const j = await r.json(); if (!j.access_token) throw new Error(`تجديد توكن يوتيوب فشل: ${j.error} ${j.error_description || ''}`);
  return j.access_token;
}

/** سجل المنشورات: كل منشور فعلي برابطه وميعاده — مفيش رابط من غير نشر حقيقي */
export const LEDGER = path.join(ROOT, 'data/posts.json');
export const posts = () => readJson(LEDGER, []);
export function addPost(p) { const all = posts(); all.push({ ...p, recordedAt: new Date().toISOString() }); writeJson(LEDGER, all); }

export const cairoHour = (iso) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso)));
export const cairoStr = (iso) => new Intl.DateTimeFormat('ar-EG', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
