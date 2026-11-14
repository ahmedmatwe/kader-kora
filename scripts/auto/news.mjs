// أخبار من الجرايد المصرية الكبيرة بس (Bing News RSS مقفول على مواقعهم) + قراءة نص المقال.
export const TRUSTED = {
  'youm7.com': 'اليوم السابع', 'cairo24.com': 'القاهرة 24', 'egypttelegraph.com': 'تليجراف مصر', 'vetogate.com': 'فيتو',
  'masrawy.com': 'مصراوي', 'almasryalyoum.com': 'المصري اليوم', 'elwatannews.com': 'الوطن', 'ahram.org.eg': 'الأهرام',
  'akhbarelyom.com': 'أخبار اليوم', 'shorouknews.com': 'الشروق', 'elbalad.news': 'صدى البلد', 'filgoal.com': 'في الجول', 'yallakora.com': 'يلا كورة',
};
const SITES = Object.keys(TRUSTED);
const unxml = (s) => String(s ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]+>/g, '').trim();
export const paperOf = (u) => { try { const h = new URL(u).hostname.replace(/^www\./, '').replace(/^sport\./, ''); return TRUSTED[h] || TRUSTED[h.split('.').slice(-2).join('.')] || ''; } catch { return ''; } };

async function bing(q, sited) {
  const sites = SITES.slice(0, 9).map((d) => `site:${d}`).join(' OR ');
  const r = await fetch(`https://www.bing.com/news/search?q=${encodeURIComponent(sited ? `${q} (${sites})` : q)}&format=rss&setlang=ar&cc=EG`, { headers: { 'user-agent': 'Mozilla/5.0' } }).catch(() => null);
  if (!r?.ok) return [];
  const out = [];
  for (const m of (await r.text()).matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const tag = (t) => unxml((m[1].match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) || [])[1]);
    let url = tag('link'); try { url = new URL(url).searchParams.get('url') || url; } catch {}
    const paper = paperOf(url); if (!paper) continue;
    out.push({ title: tag('title'), url, paper, snippet: tag('description'), at: Date.parse(tag('pubDate')) || 0 });
  }
  return out;
}
/** بحث في الجرايد الكبيرة (آخر N يوم)، من غير تكرار، الأحدث الأول */
export async function search(q, days = 2) {
  const [a, b] = await Promise.all([bing(q, true), bing(q, false)]);
  const seen = new Set(); const out = [];
  for (const h of [...a, ...b]) if (!seen.has(h.url) && (!h.at || Date.now() - h.at < days * 86400e3)) { seen.add(h.url); out.push(h); }
  return out.sort((x, y) => y.at - x.at);
}
/** نص المقال (فقرات <p>) + تاريخ النشر */
export async function article(url) {
  try {
    const r = await fetch(encodeURI(decodeURI(url)), { headers: { 'user-agent': 'Mozilla/5.0' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    const html = await r.text();
    const date = (html.match(/"datePublished"\s*:\s*"([^"]+)"/) || [])[1] || '';
    const body = html.replace(/<(script|style|nav|footer|header)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
    const ps = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => unxml(m[1])).filter((p) => p.length > 40);
    return { date, text: ps.join('\n').slice(0, 5000) };
  } catch { return { date: '', text: '' }; }
}
/** أسئلة الرصد اليومي — كورة مصرية بالأساس + عالمي يهم مصر */
export const FOOTBALL_QUERIES = [
  'منتخب مصر', 'الأهلي', 'الزمالك', 'بيراميدز', 'الدوري المصري', 'محمد صلاح', 'عمر مرموش', 'اتحاد الكرة المصري',
  'محترفين مصريين', 'كأس أمم إفريقيا', 'دوري أبطال إفريقيا', 'صفقات الأهلي الزمالك', 'حكم مباراة جدل', 'الكرة المصرية تريند',
];
