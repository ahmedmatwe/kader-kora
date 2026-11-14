// بحث في الجرايد المصرية الكبيرة بس (نفس فلتر بوت خبر يهمك). node scripts/search.mjs "كلمات" [أيام]
const w = await import(process.env.HOME + '/Desktop/khabar-yhemak-agent/bot/worker.js');
const [q, d] = process.argv.slice(2);
const hits = await w.paperSearch(q, Number(d || 3));
for (const h of hits) console.log(`${new Date(h.at).toISOString().slice(0,16)} | ${h.paper} | ${h.title}\n   ${h.uri}`);
