// رسايل المصنع لصاحب القناة على تليجرام (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID). من غيرهم بتسكت.
import fs from 'node:fs';
const T = process.env.TELEGRAM_BOT_TOKEN, C = process.env.TELEGRAM_CHAT_ID;
export async function tell(text, buttons) {
  if (!T || !C) return;
  await fetch(`https://api.telegram.org/bot${T}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: C, text: text.slice(0, 4000), ...(buttons ? { reply_markup: { inline_keyboard: [buttons] } } : {}) }) }).catch(() => {});
}
/** الفيديو نفسه + أزرار انشر/الغي */
export async function sendVideo(file, caption, id) {
  if (!T || !C) return;
  const fd = new FormData(); fd.append('chat_id', C); fd.append('caption', caption.slice(0, 1000)); fd.append('supports_streaming', 'true');
  fd.append('reply_markup', JSON.stringify({ inline_keyboard: [[{ text: '✅ انشر', callback_data: `ok:${id}` }, { text: '❌ الغي', callback_data: `no:${id}` }]] }));
  fd.append('video', new Blob([fs.readFileSync(file)], { type: 'video/mp4' }), `${id}.mp4`);
  const r = await fetch(`https://api.telegram.org/bot${T}/sendVideo`, { method: 'POST', body: fd }).catch(() => null);
  if (!r?.ok) await tell(`${caption}\n(الفيديو كبير على تليجرام — شوفه في GitHub)`, [{ text: '✅ انشر', callback_data: `ok:${id}` }, { text: '❌ الغي', callback_data: `no:${id}` }]);
}

/** الحالة اللحظية للبوت (شغالين في إيه دلوقتي) — BOT_URL + BOT_INGEST_SECRET */
export async function live(info) {
  const U = process.env.BOT_URL, K = process.env.BOT_INGEST_SECRET; if (!U || !K) return;
  await fetch(`${U}/ingest`, { method: 'POST', headers: { authorization: `Bearer ${K}`, 'content-type': 'application/json' }, body: JSON.stringify({ live: info }) }).catch(() => {});
}
