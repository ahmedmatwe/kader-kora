// 🔒 حارس النشر: الفيديو ينزل مرة واحدة بس على كل منصة. كتاب خبرته: PUBLISH_GUARD_PLAYBOOK.md
// 1) قبل أي نشر بيسأل المنصة نفسها (مش سجلّنا بس): الكابشن/العنوان ده منشور قبل كده؟ لو آه → يسجّله ويقف.
// 2) بيحجز النشر (status=publishing) ويرفعه للريبو قبل ما ينشر. لو الحجز ما اترفعش → ما بينشرش.
// 3) بعد النشر بيرفع النتيجة بإعادة محاولات. ولو الرفع وقع، الدورة الجاية بتلاقي «publishing» فتتأكد من المنصة بدل ما تنشر تاني.
import { execFileSync } from 'node:child_process';
import { DATA_DIR, googleAccess } from './lib.mjs';
import { metaCreds } from './meta.mjs';
import { overlap } from './auto/pick.mjs';
import { json } from './auto/ai.mjs';
const V = 'v27.0';
const norm = (s) => String(s || '').replace(/https?:\/\/\S+/g, '').replace(/[#\s‏‎]+/g, ' ').trim().slice(0, 90);
const same = (a, b) => { const x = norm(a), y = norm(b); return x.length > 15 && (x === y || x.startsWith(y.slice(0, 60)) || y.startsWith(x.slice(0, 60))); };
async function g(path, params) {
  const c = metaCreds(); const r = await fetch(`https://graph.facebook.com/${V}/${path}?${new URLSearchParams({ ...params, access_token: c.token })}`);
  const j = await r.json(); if (j.error) throw new Error(j.error.message); return j;
}
/** هل الفيديو ده منشور فعلًا على المنصة؟ بيرجّع {id,url} أو null. لو المنصة ما ردّتش → بيرمي غلطة (والنشر يقف) */
export async function alreadyOut(plat, pack) {
  if (plat === 'facebook') {
    const c = metaCreds(); const j = await g(`${c.pageId}/videos`, { fields: 'id,description,created_time', limit: '60' });
    const hit = (j.data || []).find((v) => same(v.description, pack.facebook.caption));
    return hit ? { id: hit.id, url: `https://www.facebook.com/reel/${hit.id}` } : null;
  }
  if (plat === 'instagram') {
    const c = metaCreds(); const j = await g(`${c.igId}/media`, { fields: 'id,caption,permalink,timestamp', limit: '60' });
    const hit = (j.data || []).find((m) => same(m.caption, pack.instagram.caption));
    return hit ? { id: hit.id, url: hit.permalink } : null;
  }
  if (plat === 'youtube') {
    const tok = await googleAccess(); const H = { authorization: `Bearer ${tok}` };
    const ch = await (await fetch('https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true', { headers: H })).json();
    const up = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads; if (!up) throw new Error('يوتيوب ما ردّش بقايمة الرفع');
    const pl = await (await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${up}`, { headers: H })).json();
    const hit = (pl.items || []).find((i) => same(i.snippet?.title, pack.youtube.title));
    return hit ? { id: hit.snippet.resourceId.videoId, url: `https://youtube.com/shorts/${hit.snippet.resourceId.videoId}` } : null;
  }
  return null;
}
/** رفع حالة الطابور للريبو بإعادة محاولات (pull --rebase). بيرجّع true لو اترفع */
export function persist(msg) {
  const git = (...a) => execFileSync('git', ['-c', 'user.name=kader-guard', '-c', 'user.email=guard@users.noreply.github.com', ...a], { cwd: DATA_DIR, stdio: 'pipe' }); // الحالة بتترفع للريبو الخاص
  try { git('add', '-A'); git('diff', '--cached', '--quiet'); return true; } catch {} // مفيش تغيير = تمام
  try { git('commit', '-qm', msg); } catch { return false; }
  for (let i = 0; i < 6; i++) {
    try { git('pull', '-q', '--rebase', '-X', 'theirs'); git('push', '-q'); return true; } catch { execFileSync('sleep', [String(3 + i * 4)]); }
  }
  return false;
}

/** نفس الخبر اتنشر قبل كده في فيديو تاني؟ (المنشورات الفعلية آخر 3 أيام). بيرجّع عنوان الفيديو القديم أو '' */
export async function sameNews(t, pack, ledger) {
  const mine = [t.topic, pack.youtube?.title, pack.facebook?.caption].filter(Boolean).join(' — ');
  const old = [...new Map(ledger.filter((x) => x.video !== t.id && x.status !== 'cancelled' && Date.now() - new Date(x.publishAt || x.recordedAt) < 3 * 86400e3).map((x) => [x.video, x])).values()];
  const near = old.filter((x) => overlap(x.title || '', mine) >= 0.34);
  if (!near.length) return '';
  // فيديو تصحيح قدام فيديو تصحيح تاني بنفس الكلام = تكرار أكيد (من غير موديل) — درس تصحيح صلاح 68 اللي نزل 3 مرات
  if (t.kind === 'denial') { const tw = near.find((x) => /denial/.test(x.video)); if (tw) return `${tw.title} (نفس التصحيح اتنشر قبل كده)`; }
  const r = await json(`إنت حارس النشر في قناة كورة. صاحب القناة مش عاوز **نفس الموضوع يتكرر** في فيديوهين (مش بس نفس الفيديو).
الفيديو اللي هيتنشر: «${mine}»
فيديوهات اتنشرت فعلًا آخر 3 أيام:
${near.map((x, i) => `${i}. ${x.title}`).join('\n')}
dup=true لو الجديد عن **نفس الموضوع** بتاع واحد منهم: نفس الشخص/الحدث/القضية، حتى لو بزاوية تانية أو تصريحات جديدة أو تفاصيل زيادة أو ردود فعل.
dup=false بس لو فيه **تطور كبير جديد** غيّر الموضوع: نتيجة ماتش اتلعب، قرار رسمي اتاخد بعد ما كان كلام، صفقة اتقفلت، إصابة اتأكدت، أو نفي/تصحيح لأول مرة.
رجّع JSON {"dup":true|false,"index":0,"why":""}`, { temp: 0 });
  return r.dup ? `${near[r.index]?.title || near[0].title} (${r.why})` : '';
}
