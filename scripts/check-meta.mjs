// فحص ربط فيس/إنستا من غير نشر + قفل الأمان
import { check, guard } from './meta.mjs';
await guard(); const r = await check(); console.log(`✓ فيسبوك: ${r.page} — إنستجرام: @${r.instagram}`);
