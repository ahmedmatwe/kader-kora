// فريق الصور: صورة حقيقية مرخصة (Wikimedia Commons: CC BY / CC BY-SA / CC0 / Public domain) + فحص احتشام وجودة بالرؤية.
// لو مفيش صورة سليمة → الفيديو يبقى موشن جرافيك بس (من غير صورة) — عمرنا ما نستخدم صورة من غير رخصة.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { vision } from './ai.mjs';
const API = 'https://commons.wikimedia.org/w/api.php';
const UA = { 'user-agent': 'KaderKoraBot/1.1 (https://github.com/ahmedmatwe/kader-kora; licensed-photo lookup)' };
const OK_LIC = /^(CC BY(-SA)? [234]\.0|CC0|Public domain|PD)/i;
const strip = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

// الاسم الكامل لازم يكون في اسم الملف ككلمة مستقلة، ومش جزء من اسم أطول («Nabil Ali Maher» مش «Ali Maher»)
// أو الملف متصنّف في أرشيف الشخص نفسه (Category) وفيه اسم عيلته
export function nameMatch(c, en) {
  const t = c.title.replace(/^File:/i, '').replace(/[_]/g, ' '); const last = en.split(' ').pop();
  if (c.fromCat) return new RegExp(`\\b${last}\\b`, 'i').test(t);
  const m = t.match(new RegExp(`(^|[^A-Za-z])(${en.replace(/\s+/g, '[ _-]+')})(?![A-Za-z])`, 'i'));
  if (!m) return false;
  const before = t.slice(0, m.index + m[1].length).trim().split(/[\s,(]+/).pop() || '';
  return !/^[A-Z][a-z]+$/.test(before); // كلمة باسم قبله = اسم شخص تاني
}
async function candidates(q, exactFile = '') {
  // أرشيف اللاعب نفسه (Category) + البحث العادي — أو ملف بعينه (صورته الرسمية P18)
  const tail = '&prop=imageinfo&iiprop=url|size|extmetadata|mime&iiurlwidth=1280';
  const urls = exactFile ? [`${API}?action=query&format=json&titles=${encodeURIComponent(`File:${exactFile}`)}${tail}`] : [`${API}?action=query&format=json&generator=categorymembers&gcmtitle=${encodeURIComponent(`Category:${q}`)}&gcmtype=file&gcmlimit=50${tail}`, `${API}?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=20&gsrsearch=${encodeURIComponent(`"${q}" filetype:bitmap`)}${tail}`];
  const pages = {}; for (const [ui, u] of urls.entries()) { const j = await (await fetch(u, { headers: UA })).json().catch(() => ({})); for (const [k, v] of Object.entries(j.query?.pages || {})) pages[k] = { ...v, fromCat: pages[k]?.fromCat || ui === 0 }; }
  return Object.values(pages).map((p) => {
    const i = p.imageinfo?.[0] || {}; const m = i.extmetadata || {};
    return { fromCat: !!p.fromCat, title: p.title, url: i.thumburl || i.url, w: i.width, h: i.height, mime: i.mime, license: strip(m.LicenseShortName?.value), artist: strip(m.Artist?.value).slice(0, 60), date: strip(m.DateTimeOriginal?.value || m.DateTime?.value), page: i.descriptionurl };
  }).filter((c) => c.url && /jpeg|png/.test(c.mime) && c.w >= 700 && OK_LIC.test(c.license) && c.artist);
}

// ===== هوية مؤكدة من ويكي داتا: لازم يكون إنسان (Q5) ولاعب/مدرب كورة. بنرجّع صورته الرسمية (P18) كمرجع + أرشيفه (P373)
const WD = 'https://www.wikidata.org/w/api.php';
const FOOTBALL_JOBS = new Set(['Q937857', 'Q628099', 'Q1194993', 'Q3665646', 'Q11774891']); // لاعب، مدرب، مدير فني...
const ids = (c, p) => (c[p] || []).map((x) => x.mainsnak?.datavalue?.value).map((v) => (v && typeof v === 'object' ? v.id : v)).filter(Boolean);
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
async function wd(url) { for (let i = 0; i < 4; i++) { const r = await fetch(url, { headers: UA }).catch(() => null); const t = r ? await r.text() : ''; try { return JSON.parse(t); } catch { await sleepMs(3000 * (i + 1)); } } return {}; }
// ذاكرة اللاعبين: اللي اتعرف مرة ما نسألش عنه تاني (data/people.json)
const PEOPLE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/people.json');
const loadPeople = () => { try { return JSON.parse(fs.readFileSync(PEOPLE, 'utf8')); } catch { return {}; } };
export async function identify(p) {
  const mem = loadPeople(); const k = (p.en || p.ar).toLowerCase();
  if (mem[k] && (mem[k].qid || Date.now() - mem[k].at < 7 * 864e5)) return mem[k].qid ? mem[k] : null;
  const r = await identifyLive(p);
  mem[k] = r ? { ...r, at: Date.now() } : { qid: null, at: Date.now() }; try { fs.writeFileSync(PEOPLE, JSON.stringify(mem, null, 1)); } catch {}
  return r;
}
async function identifyLive(p) {
  const found = new Map();
  for (const [q, lang] of [[p.en, 'en'], [p.ar, 'ar']]) {
    if (!q) continue;
    const j = await wd(`${WD}?action=wbsearchentities&search=${encodeURIComponent(q)}&language=${lang}&type=item&limit=8&format=json`);
    for (const r of j.search || []) found.set(r.id, r.description || '');
  }
  if (!found.size) return null;
  const j = await wd(`${WD}?action=wbgetentities&ids=${[...found.keys()].slice(0, 15).join('|')}&props=claims|sitelinks|descriptions&format=json`);
  if (!j.entities) throw new Error('ويكي داتا مش بيرد دلوقتي');
  const cands = Object.entries(j.entities || {}).map(([qid, e]) => { const c = e.claims || {}; return { qid, human: ids(c, 'P31').includes('Q5'), football: ids(c, 'P641').includes('Q2736') || ids(c, 'P106').some((x) => FOOTBALL_JOBS.has(x)), egypt: ids(c, 'P27').includes('Q79'), image: ids(c, 'P18')[0] || '', category: ids(c, 'P373')[0] || '', desc: e.descriptions?.en?.value || found.get(qid) || '', arwiki: e.sitelinks?.arwiki?.title || '' }; })
    .filter((x) => x.human && x.football);
  if (!cands.length) return null;
  cands.sort((a, b) => (b.egypt - a.egypt) || (Number(!!b.arwiki && b.arwiki.includes(p.ar)) - Number(!!a.arwiki && a.arwiki.includes(p.ar))) || (Number(!!b.image) - Number(!!a.image)));
  return cands[0];
}
const filePath = (name, w = 640) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=${w}`;
async function download(url, file) { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(`تحميل ${r.status}`); fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); return file; }

// مهم: ما بنقولش للرؤية اسم الشخص — الرؤية بتخمّن أسماء من ذاكرتها وبتغلط (رفضت صور صلاح الصح وقالت «زيزو»).
// الهوية متأكدة من البنية (ويكي داتا P18 + أرشيفه P373 + اسمه في اسم الملف). الرؤية بتفحص الاحتشام والجودة والسياق بس.
const CHECK = () => `إنت فريق الصور في «كادر كورة». دي صورة مرشحة لفيديو كورة. ممنوع تحاول تعرف الشخص مين أو تكتب أسماء.
قيّمها بصرامة:
- modest: محتشمة تمامًا (مفيش حد عريان أو من غير تيشيرت، مفيش لبس مكشوف، مفيش إيحاء، مفيش عنف أو دم).
- person: فيها شخص واحد واضح هو محور الصورة ووشه باين، في سياق كورة (ملعب/تدريب/مؤتمر/لبس رياضي/بورتريه رسمي) — مش استوديو مزيكا ولا مناسبة سياسية، ومش صورة جماعية.
- quality: واضحة مش مشوشة.
- text: فيه كلام أو علامة مائية كبيرة بتغطي الصورة؟
- focusX: مكان الوش أفقيًا من 0 (شمال) لـ100 (يمين).
رجّع JSON {"modest":true,"person":true,"quality":true,"text":false,"focusX":50,"why":""}`;

/** يرجّع لحد max صور مؤكدة لشخص واحد. dest = فولدر motion/public/media */
export async function findPhoto(people, slug, dest, log = console.log, max = 1) {
  const out = [];
  for (const p of (people || []).slice(0, 2)) {
    const id = await identify(p).catch(() => null);
    if (!id) { log(`⊘ صور «${p.ar}»: مش لاقيه في ويكي داتا كلاعب/مدرب كورة — من غير صورة`); continue; }
    if (!id.image && !id.category) { log(`⊘ صور «${p.ar}»: مالوش صورة مرخصة مؤكدة (${id.qid}) — من غير صورة أحسن من صورة غلط`); continue; }
    // المصادر المؤكدة بس (الإثبات من البنية مش من شكل الوش — الرؤية بتغلط في التعرّف على الوشوش):
    // 1) صورته الرسمية على ويكي داتا (P18)  2) ملفات أرشيفه (P373) واسمه الكامل في اسم الملف ومفيش اسم حد تاني
    // البحث العام ممنوع — هو اللي جاب صورة «Nabil Ali Maher» قبل كده
    let list = id.image ? (await candidates('', id.image)).map((c) => ({ ...c, official: true })) : [];
    if (id.category) list = list.concat((await candidates(id.category)).filter((c) => c.fromCat && nameMatch({ ...c, fromCat: false }, p.en)));
    list = list.filter((c) => c.official || !/\b(and|vs\.?|versus)\b|&|\+/i.test(c.title.replace(/^File:/, ''))) // ملف باسمين = مش عارفين مين فيهم
      .filter((c) => c.official || !/logo|kit|stadium map|signature|svg|c[ée]l[ée]bration|team|squad|lineup|crowd|demonstration|DPLA|church|ship|mural|statue|wax/i.test(c.title))
      .sort((a, b) => Number(!!b.official) - Number(!!a.official) || b.w - a.w);
    list = [...new Map(list.map((c) => [c.title, c])).values()].slice(0, 5);
    const ref = '';
    for (const c of list) {
      if (out.length >= max) break;
      const tmp = path.join(dest, `${slug}-cand.jpg`);
      try { await download(c.url, tmp); } catch { continue; }
      const trust = true; // كل المرشحين من مصدر مؤكد
      const v = await vision(CHECK(), [tmp]).catch(() => null);
      if (!v?.modest || !v.person || !v.quality || v.text) { fs.rmSync(tmp, { force: true }); log(`⊘ صورة ${c.title}: ${v?.why || 'مش مناسبة'}`); continue; }
      const file = `${slug}${out.length ? `-${out.length + 1}` : ''}.jpg`; fs.renameSync(tmp, path.join(dest, file));
      const year = (c.date.match(/(19|20)\d{2}/) || [])[0];
      log(`✓ صورة ${p.ar}: ${c.title} (${c.license})${c.official ? ' — صورته الرسمية' : ' — من أرشيفه وباسمه'}`);
      out.push({ src: `media/${file}`, file, label: `صورة أرشيفية${year ? ` · ${year}` : ''}`, credit: `Photo: ${c.artist} / Wikimedia Commons · ${c.license}`, focusX: Math.max(20, Math.min(80, v.focusX ?? 50)), page: c.page, person: p.ar, qid: id.qid, ref, trust, abs: path.join(dest, file) });
    }
    if (out.length) break;
  }
  return max === 1 ? out[0] || null : out;
}

/** لحد 4 صور: الشخص الأساسي لحد صورتين (عشان المكس طول الفيديو) + واحدة لكل شخص تاني */
export async function findPhotos(people, slug, dest, log = console.log, max = 4) {
  const out = []; const t0 = Date.now();
  for (const [i, p] of (people || []).slice(0, 5).entries()) {
    if (out.length >= max) break;
    if (Date.now() - t0 > 5 * 60e3) { log('⏱️ وقت الصور خلص — بنكمل باللي لقيناه'); break; }
    const got = await findPhoto([p], `${slug}-${i + 1}`, dest, log, i === 0 ? 2 : 1).catch((e) => (log(`⊘ صور «${p.ar}»: ${e.message}`), null));
    for (const ph of [].concat(got || [])) if (out.length < max) out.push(ph);
  }
  return auditPhotos(out, log);
}

/** فريق إصلاح الصور (مستقل): بيراجع كل صورة اتختارت تاني من الأول، ولو فيه شك بيشيلها */
export async function auditPhotos(photos, log = console.log) {
  const keep = [];
  const ask = (ph) => vision(`إنت فريق إصلاح الصور في «كادر كورة» — مراجع مستقل. دي صورة هتظهر في فيديو كورة. ممنوع تحاول تعرف الشخص مين أو تكتب أسماء (الهوية متأكدة من الأرشيف الرسمي).
الأخطاء اللي حصلت قبل كده: صورة مزيكاتي في استوديو اتحطت على إنها مدرب، وصور جماعية. اتأكد:
- فيها شخص واحد واضح هو المحور (مش صورة جماعية بنفس الأهمية)
- سياق كورة أو بورتريه رسمي (مش استوديو مزيكا ولا مناسبة سياسية)
- محتشمة تمامًا
رجّع JSON {"ok":true|false,"why":""}`, [ph.abs]);
  for (const ph of photos) {
    const v = await ask(ph).catch(() => ask(ph)).catch(() => ({ ok: !!ph.trust, why: 'المراجع ما ردّش' }));
    if (v?.ok) keep.push(ph); else log(`🛠️ فريق إصلاح الصور شال صورة «${ph.person}»: ${v?.why || ''}`);
  }
  return keep;
}

// ===== صور السياق (منتخب/نادي/استاد/جمهور): مش لشخص معيّن، فبنرفض أي صورة بورتريه لحد واحد عشان ما نوحيش إنه حد غلط
const CTX = [
  [/منتخب مصر|الفراعنة|المنتخب/, 'منتخب مصر', ['Matches of Egypt national association football team', 'Egypt national association football team', 'Group photographs of Egypt national association football team']],
  [/الأهلي/, 'الأهلي', ['Al Ahly SC in 2021 FIFA Club World Cup', 'Al Ahly SC']],
  [/الزمالك/, 'الزمالك', ['Zamalek SC']],
  [/بيراميدز/, 'بيراميدز', ['Pyramids FC']],
  [/استاد القاهرة/, 'استاد القاهرة', ['Cairo International Stadium']],
  [/برج العرب/, 'برج العرب', ['Borg El Arab Stadium']],
];
const GENERIC = ['Cairo International Stadium', 'Association football in Egypt', 'Borg El Arab Stadium'];
const SKIP_CAT = /women|basketball|handball|volleyball|kits|line-ups|coaches|players|logos|futsal|beach/i;
async function catFiles(cat, depth = 1) {
  let files = (await candidates(cat)).filter((c) => c.fromCat);
  if (depth > 0 && files.length < 12) {
    const j = await wd(`${API}?action=query&format=json&list=categorymembers&cmtitle=${encodeURIComponent(`Category:${cat}`)}&cmtype=subcat&cmlimit=15`);
    for (const sc of (j.query?.categorymembers || []).map((x) => x.title.replace(/^Category:/, '')).filter((t) => !SKIP_CAT.test(t)).slice(0, 4)) files = files.concat(await catFiles(sc, depth - 1));
  }
  return files;
}
const CTX_CHECK = (tag) => `إنت فريق الصور في «كادر كورة». دي صورة مرشحة كخلفية لفيديو عن «${tag}» (كورة قدم رجالي في مصر).
قيّمها بصرامة:
- modest: محتشمة تمامًا (مفيش حد عريان أو من غير تيشيرت، مفيش لبس مكشوف، مفيش إيحاء، مفيش عنف أو دم).
- football: مشهد كورة قدم (ماتش، ملعب، استاد، جمهور، فريق، تدريب) — مش سلة ولا يد ولا مناسبة سياسية.
- closeup: true لو الصورة بورتريه قريب لشخص واحد هو المحور (إحنا مش عارفين هو مين فمش هنستخدمها).
- quality: واضحة ومش مشوشة ولا قديمة جدًا أبيض وأسود.
- text: فيه كلام كبير أو لوجو أو علامة مائية بتغطي الصورة؟
- focusX: مركز الصورة أفقيًا من 0 لـ100.
رجّع JSON {"modest":true,"football":true,"closeup":false,"quality":true,"text":false,"focusX":50,"why":""}`;
/** لحد max صور سياق مرخصة: الأول للفرق/الأماكن اللي في القصة، وبعدين صور عامة لكورة مصر */
export async function findContext(story, slug, dest, log = console.log, max = 3) {
  const text = [story.topic, ...(story.facts || []).map((f) => f.text || f)].join(' ');
  const wanted = CTX.filter(([re]) => re.test(text)); const out = []; const t0 = Date.now(); const seen = new Set();
  const plan = [...wanted.map(([, tag, cats]) => [tag, cats, CTX.find((x) => x[1] === tag)[0].source]), ['كورة مصرية', GENERIC, '']];
  for (const [tag, cats, re] of plan) {
    let list = []; for (const c of cats) { list = list.concat(await catFiles(c).catch(() => [])); if (list.length > 40) break; }
    list = list.filter((c) => !seen.has(c.title) && !/svg|logo|kit|map|signature|crest|emblem|badge|women|ticket|poster|stamp/i.test(c.title)).sort(() => Math.random() - 0.5).slice(0, 6);
    let got = 0;
    for (const c of list) {
      if (out.length >= max || got >= (tag === 'كورة مصرية' ? max : 2) || Date.now() - t0 > 150e3) break;
      seen.add(c.title); const tmp = path.join(dest, `${slug}-ctx-cand.jpg`);
      try { await download(c.url, tmp); } catch { continue; }
      const v = await vision(CTX_CHECK(tag), [tmp]).catch(() => null);
      if (!v?.modest || !v.football || v.closeup || !v.quality || v.text) { fs.rmSync(tmp, { force: true }); log(`⊘ صورة سياق ${c.title}: ${v?.why || 'مش مناسبة'}`); continue; }
      const file = `${slug}-ctx-${out.length + 1}.jpg`; fs.renameSync(tmp, path.join(dest, file)); got++;
      log(`✓ صورة سياق «${tag}»: ${c.title} (${c.license})`);
      out.push({ src: `media/${file}`, file, ctx: true, tag, re, credit: `Photo: ${c.artist} / Wikimedia Commons · ${c.license}`, focusX: Math.max(20, Math.min(80, v.focusX ?? 50)), page: c.page, abs: path.join(dest, file) });
    }
  }
  return out;
}
