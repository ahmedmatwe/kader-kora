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
async function candidates(q) {
  // أرشيف اللاعب نفسه (Category) + البحث العادي
  const tail = '&prop=imageinfo&iiprop=url|size|extmetadata|mime&iiurlwidth=1280';
  const urls = [`${API}?action=query&format=json&generator=categorymembers&gcmtitle=${encodeURIComponent(`Category:${q}`)}&gcmtype=file&gcmlimit=50${tail}`, `${API}?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=20&gsrsearch=${encodeURIComponent(`"${q}" filetype:bitmap`)}${tail}`];
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

const CHECK = (p, id, hasRef) => `إنت فريق الصور في «كادر كورة». ${hasRef ? 'الصورة الأولى هي الصورة الرسمية المؤكدة لـ' : 'دي صورة مرشحة لـ'}«${p.ar}» (${p.en}${id?.desc ? ` — ${id.desc}` : ''}).${hasRef ? ' الصورة التانية مرشحة للفيديو.' : ''}
قيّم ${hasRef ? 'الصورة التانية' : 'الصورة'} بصرامة شديدة:
${hasRef ? '- same: الشخص الأساسي فيها هو نفس الشخص اللي في الصورة الأولى (قارن الوش، ملامحه، لون البشرة، الشعر، الدقن). لو مش متأكد 100% → false.\n' : ''}- modest: محتشمة تمامًا (مفيش حد عريان أو من غير تيشيرت، مفيش لبس مكشوف، مفيش إيحاء، مفيش عنف أو دم).
- person: فيها شخص واحد واضح هو محور الصورة، وشه باين، في سياق كورة (ملعب/تدريب/مؤتمر/لبس رياضي) — مش استوديو مزيكا ولا مناسبة سياسية.
- quality: واضحة مش مشوشة.
- text: فيه كلام أو علامة مائية كبيرة؟
- focusX: مكان الوش أفقيًا من 0 (شمال) لـ100 (يمين).
رجّع JSON {${hasRef ? '"same":true,' : ''}"modest":true,"person":true,"quality":true,"text":false,"focusX":50,"why":""}`;

/** يرجّع لحد max صور مؤكدة لشخص واحد. dest = فولدر motion/public/media */
export async function findPhoto(people, slug, dest, log = console.log, max = 1) {
  const out = [];
  for (const p of (people || []).slice(0, 2)) {
    const id = await identify(p).catch(() => null);
    if (!id) { log(`⊘ صور «${p.ar}»: مش لاقيه في ويكي داتا كلاعب/مدرب كورة — من غير صورة`); continue; }
    if (!id.image && !id.category) { log(`⊘ صور «${p.ar}»: مالوش صورة مرخصة مؤكدة (${id.qid}) — من غير صورة أحسن من صورة غلط`); continue; }
    let ref = '';
    if (id.image) { try { ref = await download(filePath(id.image, 640), path.join(dest, `${slug}-ref.jpg`)); } catch {} }
    // المرشحين: أرشيف الشخص (P373) + صورته الرسمية + بحث بالاسم الكامل (البحث مسموح بس لو فيه مرجع نقارن بيه)
    let list = id.category ? (await candidates(id.category)).filter((c) => c.fromCat) : [];
    if (ref) list = list.concat((await candidates(p.en)).filter((c) => !c.fromCat && nameMatch(c, p.en)));
    list = list.filter((c) => !/logo|kit|stadium map|signature|svg|c[ée]l[ée]bration|team|squad|lineup|crowd|demonstration|DPLA|church|ship/i.test(c.title))
      .filter((c) => c.fromCat || nameMatch(c, p.en))
      .sort((a, b) => Number(nameMatch(b, p.en)) - Number(nameMatch(a, p.en)) || Number(b.title.includes(id.image)) - Number(a.title.includes(id.image)) || b.w - a.w);
    list = [...new Map(list.map((c) => [c.title, c])).values()].slice(0, 5);
    for (const c of list) {
      if (out.length >= max) break;
      const tmp = path.join(dest, `${slug}-cand.jpg`);
      try { await download(c.url, tmp); } catch { continue; }
      const v = await vision(CHECK(p, id, !!ref), ref ? [ref, tmp] : [tmp]).catch(() => null);
      if (!v?.modest || !v.person || !v.quality || v.text || (ref && !v.same)) { fs.rmSync(tmp, { force: true }); log(`⊘ صورة ${c.title}: ${v?.why || 'مش مناسبة'}`); continue; }
      const file = `${slug}${out.length ? `-${out.length + 1}` : ''}.jpg`; fs.renameSync(tmp, path.join(dest, file));
      const year = (c.date.match(/(19|20)\d{2}/) || [])[0];
      log(`✓ صورة ${p.ar}: ${c.title} (${c.license})${ref ? ' — مطابقة للصورة الرسمية' : ' — من أرشيفه'}`);
      out.push({ src: `media/${file}`, file, label: `صورة أرشيفية${year ? ` · ${year}` : ''}`, credit: `Photo: ${c.artist} / Wikimedia Commons · ${c.license}`, focusX: Math.max(20, Math.min(80, v.focusX ?? 50)), page: c.page, person: p.ar, qid: id.qid, ref, abs: path.join(dest, file) });
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
  for (const ph of photos) {
    const v = await vision(`إنت فريق إصلاح الصور في «كادر كورة» — مراجع مستقل، شغلتك تمسك الغلط قبل ما يتنشر. اتقالك إن الصورة ${ph.ref ? 'التانية' : ''} هي «${ph.person}» (لاعب/مدرب كورة).
${ph.ref ? 'الصورة الأولى هي صورته الرسمية المؤكدة.' : ''}
الأخطاء اللي حصلت قبل كده: صورة مزيكاتي اسمه «Nabil Ali Maher» اتحطت على إنها المدرب علي ماهر، وصورة لاعب اتحطت على كلام عن شخص تاني. اتأكد إن ده مايحصلش.
رجّع JSON {"ok":true|false,"why":""} — ok=false لو فيه أي شك إن ده مش «${ph.person}» أو إنها مش في سياق كورة.`, ph.ref ? [ph.ref, ph.abs] : [ph.abs]).catch(() => ({ ok: false, why: 'المراجع ما ردّش' }));
    if (v?.ok) keep.push(ph); else log(`🛠️ فريق إصلاح الصور شال صورة «${ph.person}»: ${v?.why || ''}`);
  }
  return keep;
}
