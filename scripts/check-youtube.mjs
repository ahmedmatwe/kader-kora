// فحص الربط من غير نشر: بيجدد التوكن ويقرا اسم القناة
import { googleAccess } from './lib.mjs';
const t = await googleAccess();
const j = await (await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { authorization: `Bearer ${t}` } })).json();
const c = j.items?.[0]; if (!c) { console.error('✗ مفيش قناة', JSON.stringify(j).slice(0, 200)); process.exit(1); }
console.log(`✓ الربط شغال — القناة: ${c.snippet.title} (${c.id})`);
