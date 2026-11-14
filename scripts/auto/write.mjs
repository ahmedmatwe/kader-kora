// فريق الهوكات + فريق السيناريو + مراجع السيناريو (مستقل) + فريق المشاهد (الموشن).
import { json } from './ai.mjs';

const factsText = (s) => [
  ...s.facts.map((f, i) => `- [F${i + 1}] ${f.fact} (${f.papers.join('، ')})`),
  ...(s.claim_single || []).map((f) => `- بحسب ${f.paper}: ${f.fact}`),
  ...(s.conflicts || []).map((c) => `- خلاف بين الجرايد: ${c}`),
].join('\n');
export { factsText };

/** فريق الهوكات: 8 افتتاحيات → تقييم → الأقوى */
export async function hooks(story) {
  const r = await json(`إنت فريق الهوكات في «كادر كورة» (شورتس كورة مصرية). القصة: ${story.topic}
الحقايق المؤكدة:\n${factsText(story)}
اكتب 8 افتتاحيات مختلفة (أول جملة في الفيديو، ≤ 14 كلمة، بالعامية المصرية). الهوك لازم يقوم على حقيقة مؤكدة [F..] بس — مش على «بحسب» ولا على خلاف. رأي أي حد يتقال كرأيه («شايف إن»)، مش كحقيقة، ومن غير «فضح/كشف حقيقة/نارية». أنواع: سؤال، مفارقة، رقم صادم، «محدش واخد باله»، مقارنة. صادقة 100% من الحقايق بس، من غير تهويل أو وعد مش في الفيديو.
قيّم كل واحدة من 10 في: فضول، وضوح من أول ثانيتين، صدق. رجّع JSON {"hooks":[{"text":"","curiosity":0,"clarity":0,"truth":0}]}`, { temp: 0.9 });
  const best = (r.hooks || []).filter((h) => h.truth >= 9).sort((a, b) => (b.curiosity + b.clarity) - (a.curiosity + a.clarity));
  return { best: best[0]?.text, all: r.hooks || [] };
}

const SCRIPT_RULES = `- عامية مصرية طبيعية زي مذيع ستوديو تحليلي، جمل قصيرة، من غير فصحى.
- الأرقام والسنين مكتوبة بالحروف زي ما بتتنطق (سبعين، ألفين وتلاتاشر، خمسة صفر) — عشان الصوت.
- 6 لـ 9 سطور، المجموع 85 لـ 125 كلمة (45 ثانية تقريبًا). كل سطر فكرة واحدة.
- أول سطر = الهوك بالظبط. آخر سطر id="outro": سؤال للكومنتات (ولو فيه ماتش جاي اذكره).
- رأي أو اتهام أي حد (مدرب، لاعب، مسؤول) يتقال على إنه رأيه: «شايف إن»، «بيقول إن» — عمره ما يتقال كحقيقة («كشف حقيقة»، «فضح»، «أثبت»). ممنوع كلمات زي «نارية»، «فضيحة»، «صادم».
- قصة واحدة بس من أولها لآخرها: ما تدخلش في مواضيع جانبية (مدرب تاني، ماتش تاني، أخبار مالهاش علاقة).
- الأساس هو الحقايق المؤكدة [F..]. معلومة «بحسب» جريدة واحدة: سطر واحد بالكتير ولازم «بحسب <الجريدة>». الخلافات: اذكرها بس لو هي نفسها قلب القصة.
- ممنوع: معلومة مش في الحقايق، رأي مسيء في حد، «حصري»، «صوت AI»، أسماء مواقع غير الجرايد.
- hi: كلمة أو اتنين من السطر نفسه (بالظبط زي ما مكتوبة) تتلوّن في الترجمة.`;

/** فريق السيناريو */
export async function script(story, hook, notes = []) {
  return json(`إنت فريق السيناريو في «كادر كورة». القصة: ${story.topic}\nالحقايق:\n${factsText(story)}\nالهوك المختار: ${hook}\n${SCRIPT_RULES}${notes.length ? `\nملاحظات المراجع على النسخة اللي فاتت (لازم تتصلح): ${notes.join(' | ')}` : ''}
رجّع JSON {"lines":[{"id":"hook","vo":"","hi":[""]},{"id":"english_id","vo":"","hi":[]}, ... ,{"id":"outro","vo":"","hi":[]}]}`, { temp: 0.6 });
}

/** مراجع السيناريو (مستقل وقاسي): كل سطر لازم يتربط بحقيقة، والسطر اللي مالوش سند بيتشال */
export async function reviewScript(story, sc) {
  const r = await json(`إنت مراجع مستقل وقاسي في «كادر كورة». شغلتك تمنع أي غلطة توصل للجمهور.
الحقايق (F = مؤكدة من جريدتين، «بحسب» = جريدة واحدة):\n${factsText(story)}\nالقواعد:\n${SCRIPT_RULES}\nالسيناريو:\n${JSON.stringify(sc.lines, null, 1)}
لكل سطر: support = "F1"/"F2"... لو كل كلامه مؤكد، أو "single:<الجريدة>" لو من جريدة واحدة ومكتوب فيه «بحسب»، أو "none" لو فيه أي معلومة مش في الحقايق، أو حقيقة اتقالت أكيدة وهي من جريدة واحدة، أو موضوع جانبي.
صلّح السطر لو ينفع يتصلّح من الحقايق (واكتب support الجديد)، ولو ما ينفعش سيبه none. سطر outro: support="outro".
الهوك لازم يكون F. رجّع JSON {"issues":["..."],"lines":[{"id":"","vo":"","hi":[],"support":""}]}`, { temp: 0.1 });
  const lines = (r.lines || []).filter((l) => l.support && l.support !== 'none');
  const singles = lines.filter((l) => /^single/.test(l.support));
  for (const l of singles.slice(1)) lines.splice(lines.indexOf(l), 1); // سطر «بحسب» واحد بس
  return { issues: r.issues || [], lines, hookOk: /^F/.test(lines[0]?.support || '') && lines[0]?.id === sc.lines[0].id, dropped: (r.lines || []).length - lines.length };
}

const SCENES = `مكتبة المشاهد (type: props) — كل مشهد بيغطي سطر واحد (from=to=id السطر):
- photo: {src,label,credit,title,accent?,badge?,zoom:"in"|"out",focusX:0-100} ← بس لو فيه صورة متاحة (هتتبعتلك)، وأحسن للسطر الأول.
- headline: {kicker?:"عاجل|مفاجأة|رسميًا", title, accent?, sub?}
- score: {home,away,hs:number,as:number,sub:"البطولة\\nاليوم والتاريخ",note?}
- versus: {title, a:{name,value:number,tag}, b:{name,value:number,tag}, winner:"a"|"b"}
- claim: {who:"مين قال", value:"رقم كنص", unit, note?}
- stat: {value:number, prefix?, suffix?, label, note?}
- quote: {who, role?, text:"تصريح منقول بالحرف من الحقايق", src:"المصدر: <الجريدة>"}
- list: {title, items:[2-4 نقط قصيرة ≤ 28 حرف]}
- flashback: {from_year:number,to_year:number,title,detail}
- verdict: {title:"الخلاصة", yes:{n,cond,res}, no:{n,cond,res}} ← للجدل/الخلاف بس
- end: {next?:"الماتش الجاي" , when?:"امتى", cta:"سؤال قصير للكومنتات"} ← آخر مشهد دايمًا (from=to="outro")
تنويع (مهم): اخلط بين اللقطات الحقيقية (photo) والموشن جرافيك — لو فيه صور متاحة استخدم كل صورة مرة واحدة، وحطها متفرقة (صورة ← موشن ← صورة ← موشن)، وأول مشهد صورة لو متاحة. لكل صورة title قصير مختلف عن اللي قبله.\nقواعد: كل النصوص على الشاشة قصيرة (العنوان ≤ 26 حرف، السطر ≤ 30 حرف)، عامية مصرية، من الحقايق بس، والأرقام أرقام (70 مش سبعين). نوّع المشاهد (ما تكررش نفس النوع ورا بعض). trend: 2-4 كلمات. keep: أسماء من كلمتين أو أكتر لازم ما تتقسمش في الترجمة.`;

/** فريق المشاهد (موشن جرافيك) */
export async function scenes(story, lines, photo) {
  const r = await json(`إنت فريق الموشن جرافيك في «كادر كورة». حوّل السيناريو لمشاهد من المكتبة.\n${SCENES}
الحقايق:\n${factsText(story)}\nالسيناريو:\n${JSON.stringify(lines)}\nالصور المتاحة (لقطات حقيقية مرخصة): ${photo?.length ? JSON.stringify(photo) : 'مفيش — ما تستخدمش photo'}
رجّع JSON {"trend":"","keep":[""],"scenes":[{"type":"","from":"id","to":"id", ...props}]}`, { temp: 0.4 });
  return r;
}

const REQ = { photo: ['src', 'label', 'credit'], headline: ['title'], score: ['home', 'away', 'hs', 'as', 'sub'], versus: ['title', 'a', 'b'], claim: ['who', 'value', 'unit'], stat: ['value', 'label'], quote: ['who', 'text'], list: ['title', 'items'], flashback: ['from_year', 'to_year', 'title', 'detail'], verdict: ['title', 'yes', 'no'], end: ['cta'] };
/** فحص آلي للمشاهد: الأنواع والـprops وتغطية كل السطور */
export function checkScenes(sc, lines) {
  const ids = lines.map((l) => l.id); const errs = [];
  for (const s of sc.scenes || []) {
    if (!REQ[s.type]) errs.push(`نوع مش معروف ${s.type}`);
    else for (const k of REQ[s.type]) if (s[k] == null || s[k] === '') errs.push(`${s.type} ناقصه ${k}`);
    if (s.type === 'stat') { const v = Number(String(s.value ?? '').replace(/[^0-9.]/g, '')); if (!Number.isFinite(v) || String(s.value ?? '').replace(/[^0-9.]/g, '') === '') errs.push('stat.value لازم رقم'); else s.value = v; }
    for (const k of ['title', 'label', 'text', 'sub', 'note', 'detail']) if (typeof s[k] === 'string') s[k] = s[k].replace(/(^|\s)بـ\s*(\d)/g, '$1$2').replace(/(\d)([\u0600-\u06FF])/g, '$1 $2').replace(/([\u0600-\u06FF])(\d)/g, '$1 $2');
    if (!ids.includes(s.from) || !ids.includes(s.to)) errs.push(`${s.type}: from/to مش موجودين`);
    for (const k of ['title', 'label', 'text']) if (typeof s[k] === 'string' && s[k].length > (k === 'text' ? 90 : 34)) errs.push(`${s.type}.${k} طويل`);
  }
  const covered = new Set(); for (const s of sc.scenes || []) { const a = ids.indexOf(s.from), b = ids.indexOf(s.to); for (let i = a; i <= b; i++) covered.add(ids[i]); }
  for (const id of ids) if (!covered.has(id)) errs.push(`السطر ${id} مالوش مشهد`);
  if (sc.scenes?.at(-1)?.type !== 'end') errs.push('آخر مشهد لازم end');
  return errs;
}

// فريق الإصلاح: بياخد مشاكل مراجعة الجودة (فريم N = مشهد N) ويصلّح المشاهد بدل ما الفيديو يتلغي.
export async function fixScenes(story, lines, sn, problems, photos) {
  const r = await json(`إنت فريق الإصلاح في «كادر كورة». مراجعة الجودة لقت مشاكل في الفيديو. صلّح المشاهد عشان المشاكل دي تختفي، من غير ما تغيّر السيناريو أو الحقايق.\n${SCENES}
قواعد الإصلاح:
- فريم رقم N = المشهد رقم N في القايمة.
- نص طويل/متداخل/مقطوع → قصّره أو قسّمه.
- رقم ملزوق في كلمة أو «بـ 7» → اكتب الرقم لوحده بمسافات («7 نقاط»)، أو حط الرقم في stat.value كرقم بس والكلمة في suffix.
- رقم ممكن يتفهم غلط (ترتيب، معكوس) → غيّر نوع المشهد لحاجة أوضح.
- صورة مش مناسبة أو مش محتشمة → شيل مشهد الصورة وحط مكانه موشن (headline/stat/list).
- خلي from/to زي ما هم بالظبط، وكل السطور متغطية.
الحقايق:\n${factsText(story)}\nالسيناريو:\n${JSON.stringify(lines)}\nالصور المتاحة: ${JSON.stringify(photos)}
المشاهد الحالية:\n${JSON.stringify(sn.scenes)}
المشاكل:\n${problems.map((p) => `فريم ${p.frame}: ${p.issue}`).join('\n')}
رجّع JSON {"trend":"","keep":[""],"scenes":[...]}`, { temp: 0.2 });
  return { trend: r.trend || sn.trend, keep: r.keep || sn.keep, scenes: r.scenes || sn.scenes };
}
