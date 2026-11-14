// فريق التريند + فريق التحقيق: بيلاقي أقوى قصة كورة مصرية النهارده، ومش بيعدّيها إلا لو فيه جريدتين كبار على الأقل.
// لو مفيش تريند قوي: بيدوّر في Google Trends مصر (الناس بتبحث عن إيه) ويختار اللي ليه علاقة بالكورة/الرياضة.
import { search, article, FOOTBALL_QUERIES, paperOf } from './news.mjs';
import { json } from './ai.mjs';

/** أكتر حاجات الناس بتبحث عنها في مصر دلوقتي (Google Trends RSS) */
export async function googleTrends() {
  const r = await fetch('https://trends.google.com/trending/rss?geo=EG', { headers: { 'user-agent': 'Mozilla/5.0' } }).catch(() => null);
  if (!r?.ok) return [];
  const x = await r.text();
  return [...x.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => ({
    q: (m[1].match(/<title>([^<]+)<\/title>/) || [])[1] || '',
    traffic: (m[1].match(/<ht:approx_traffic>([^<]+)</) || [])[1] || '',
  })).filter((t) => t.q);
}

const POLICY = `سياسة القناة: كورة/رياضة مصرية بالأساس، والعالمي بس لو يهم مصر (لاعب مصري، منتخب، أندية مصرية، بطولة مصر فيها).
ممنوع: شائعات من غير مصدرين، وفيات/حوادث/جرائم/أمراض لاعبين، سياسة أو دين، تشهير أو اتهام لحد، حياة شخصية، مراهنات.`;

export async function pickStory({ recent = [], log = console.log, request = '' } = {}) {
  // 1) أخبار الجرايد الكبيرة آخر 24 ساعة (ولو صاحب القناة طالب موضوع، بندوّر عليه هو الأول)
  const hits = []; const seen = new Set();
  if (request) { for (const h of await search(request, 4)) if (!seen.has(h.url)) { seen.add(h.url); hits.push({ ...h, searched: request }); } log(`📝 طلب صاحب القناة: «${request}» — ${hits.length} خبر`); }
  for (const q of request ? [] : FOOTBALL_QUERIES) for (const h of await search(q, 1)) if (!seen.has(h.url)) { seen.add(h.url); hits.push(h); }
  // 2) اللي الناس بتبحث عنه
  const gt = await googleTrends();
  const sporty = gt.length ? (await json(`${POLICY}\nدي أكتر حاجات الناس بتبحث عنها في مصر النهارده. اختار بس اللي ليها علاقة بالكورة أو الرياضة (لاعب، نادي، مدرب، ماتش، بطولة).\n${gt.map((t) => `- ${t.q} (${t.traffic})`).join('\n')}\nرجّع JSON {"sport":["..."]}`, { light: true }).catch(() => ({ sport: [] }))).sport || [] : [];
  for (const q of sporty.slice(0, 6)) for (const h of await search(q, 2)) if (!seen.has(h.url)) { seen.add(h.url); hits.push({ ...h, searched: q }); }
  log(`📰 ${hits.length} خبر من الجرايد الكبيرة · 🔎 بحث الناس: ${sporty.join('، ') || '—'}`);
  if (!hits.length) return null;
  // 3) تجميع القصص وترتيبها
  const list = hits.slice(0, 160).map((h, i) => `${i}. [${h.paper}] ${h.title}${h.searched ? ` (الناس بتبحث: ${h.searched})` : ''}`).join('\n');
  const r = await json(`${POLICY}
إنت رئيس تحرير قناة شورتس «كادر كورة». دي عناوين آخر 24-48 ساعة من الجرايد المصرية الكبيرة:
${list}

جمّع العناوين اللي بتتكلم عن نفس القصة، واختار أقوى 5 قصص تنفع فيديو شورت 45 ثانية النهارده:
- القصة لازم تكون مذكورة في جريدتين مختلفتين على الأقل (رقم العناوين من جرايد مختلفة).
${request ? `- صاحب القناة طالب الموضوع ده بالاسم: «${request}» — اختار القصص اللي عنه بس.\n` : ''}- رتّب حسب: قد إيه الناس مهتمة/بتبحث، جديدة، فيها رقم أو مفارقة أو جدل كروي مشروع.
- استبعد أي قصة اتعملت قبل كده أو قريبة منها (نفس الحدث أو نفس الرقم أو نفس اللاعب في نفس الموضوع): ${recent.length ? recent.join(' | ') : 'مفيش'}
رجّع JSON {"stories":[{"topic":"وصف القصة في سطر","slug":"english-slug-2-4-words","ids":[أرقام العناوين],"why":"ليه تريند","type":"news|match-reaction|evergreen","searched":true|false}]}`, { temp: 0.3 });
  for (const s of r.stories || []) {
    const src = [...new Map((s.ids || []).map((i) => hits[i]).filter(Boolean).map((h) => [h.paper, h])).values()];
    if (src.length < 2) { log(`⊘ «${s.topic}»: مصدر واحد بس`); continue; }
    const v = await verify(s, src, log);
    if (v) return v;
  }
  return null;
}

/** فريق التحقيق: يقرا المقالات نفسها ويطلّع الحقايق اللي متأكدة بس */
export async function verify(story, src, log = console.log) {
  const arts = [];
  for (const h of src.slice(0, 5)) { const a = await article(h.url); if (a.text.length > 300) arts.push({ ...h, ...a }); }
  if (new Set(arts.map((a) => a.paper)).size < 2) { log(`⊘ «${story.topic}»: ما قدرناش نقرا جريدتين`); return null; }
  const r = await json(`${POLICY}
إنت فريق التحقيق والتدقيق. القصة: ${story.topic}
المقالات (كل واحدة باسم جريدتها):
${arts.map((a, i) => `### [${i}] ${a.paper} — ${a.title} (${a.date || 'تاريخ مش واضح'})\n${a.text.slice(0, 2500)}`).join('\n\n')}

المطلوب:
1) facts: الحقايق اللي في جريدتين أو أكتر (اكتب الجرايد). أي حاجة في جريدة واحدة تتكتب "بحسب <الجريدة>" في claim_single، أو تتشال لو مش مهمة.
2) conflicts: أي أرقام أو معلومات مختلفة بين الجرايد.
3) ok=false لو: شائعة مش مؤكدة، أو مخالفة للسياسة، أو القصة قديمة (أكتر من 3 أيام)، أو مفيش حقيقتين مؤكدتين.
4) people: الأسماء الأساسية (لاعب/مدرب/نادي) بالإنجليزي زي ما مكتوبة في ويكيبيديا، عشان الصور.
رجّع JSON {"ok":true,"reason":"","facts":[{"fact":"","papers":[""]}],"claim_single":[{"fact":"","paper":""}],"conflicts":[""],"people":[{"ar":"","en":""}],"next_match":{"name":"","when":""}|null}`, { temp: 0.1 });
  if (!r.ok || (r.facts || []).length < 2) { log(`⊘ «${story.topic}»: ${r.reason || 'حقايق مش كفاية'}`); return null; }
  log(`✓ القصة: «${story.topic}» — ${r.facts.length} حقيقة مؤكدة من ${new Set(arts.map((a) => a.paper)).size} جرايد`);
  return { ...story, ...r, sources: arts.map((a) => ({ paper: a.paper, title: a.title, url: a.url, date: a.date })) };
}
