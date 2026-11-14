// فريق الصور: صورة حقيقية مرخصة (Wikimedia Commons: CC BY / CC BY-SA / CC0 / Public domain) + فحص احتشام وجودة بالرؤية.
// لو مفيش صورة سليمة → الفيديو يبقى موشن جرافيك بس (من غير صورة) — عمرنا ما نستخدم صورة من غير رخصة.
import fs from 'node:fs'; import path from 'node:path';
import { vision } from './ai.mjs';
const API = 'https://commons.wikimedia.org/w/api.php';
const UA = { 'user-agent': 'KaderKoraBot/1.0 (shorts studio; contact via GitHub)' };
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

/** يرجّع {src,label,credit,file} أو null. dest = فولدر motion/public/media */
export async function findPhoto(people, slug, dest, log = console.log) {
  for (const p of (people || []).slice(0, 2)) {
    const list = (await candidates(p.en)).filter((c) => !/logo|kit|stadium map|signature|svg|c[ée]l[ée]bration|team|squad|lineup|crowd|demonstration|DPLA|church|ship/i.test(c.title))
      .filter((c) => nameMatch(c, p.en))
      .sort((a, b) => Number(b.title.toLowerCase().includes(p.en.split(' ').pop().toLowerCase())) - Number(a.title.toLowerCase().includes(p.en.split(' ').pop().toLowerCase())) || b.w - a.w).slice(0, 3);
    for (const c of list) {
      const tmp = path.join(dest, `${slug}-cand.jpg`);
      const b = Buffer.from(await (await fetch(c.url, { headers: UA })).arrayBuffer()); fs.writeFileSync(tmp, b);
      const v = await vision(`دي صورة مرشحة لفيديو كورة عن «${p.ar}» (${p.en}). قيّمها بصرامة:
- modest: محتشمة تمامًا (مفيش حد عريان أو من غير تيشيرت، مفيش لبس مكشوف، مفيش إيحاء، مفيش عنف أو دم).
- person: فيها شخص واحد واضح هو محور الصورة (لاعب/مدرب في سياق كورة)، الوش باين، مش لوجو ولا ملعب فاضي ولا جمهور بس.
- quality: واضحة مش مشوشة.
- text: مفيش كلام أو علامة مائية كبيرة على الصورة.
- focusX: مكان الوش أفقيًا من 0 (شمال) لـ100 (يمين).
رجّع JSON {"modest":true,"person":true,"quality":true,"text":false,"focusX":50,"why":""}`, [tmp]).catch(() => null);
      if (!v?.modest || !v.person || !v.quality || v.text) { fs.rmSync(tmp, { force: true }); log(`⊘ صورة ${c.title}: ${v?.why || 'مش مناسبة'}`); continue; }
      const file = `${slug}.jpg`; fs.renameSync(tmp, path.join(dest, file));
      const year = (c.date.match(/(19|20)\d{2}/) || [])[0];
      log(`✓ صورة: ${c.title} (${c.license})`);
      return { src: `media/${file}`, file, label: `صورة أرشيفية${year ? ` · ${year}` : ''}`, credit: `Photo: ${c.artist} / Wikimedia Commons · ${c.license}`, focusX: Math.max(20, Math.min(80, v.focusX ?? 50)), page: c.page, person: p.ar };
    }
  }
  return null;
}

/** لحد 3 صور لأشخاص/أماكن مختلفة في القصة — عشان الفيديو يتنوّع بين لقطات حقيقية وموشن جرافيك */
export async function findPhotos(people, slug, dest, log = console.log, max = 3) {
  const out = []; const t0 = Date.now();
  for (const [i, p] of (people || []).slice(0, 5).entries()) {
    if (out.length >= max) break;
    if (Date.now() - t0 > 4 * 60e3) { log('⏱️ وقت الصور خلص — بنكمل باللي لقيناه'); break; }
    const ph = await findPhoto([p], `${slug}-${i + 1}`, dest, log).catch(() => null);
    if (ph) out.push(ph);
  }
  return out;
}
