// فريق العناوين: عنوان/كابشن قصير لكل منصة حسب خوارزميتها — الهدف انتشار من غير تضليل.
// العنوان/الكابشن بس — من غير مصادر ولا حقوق صور ولا أي كلام عن الصوت، لا في الكابشن ولا في الكومنتات (حقوق الصورة مكتوبة على الصورة جوه الفيديو).
import { json } from './ai.mjs';
export const TITLE_RULES = `إنت فريق العناوين في قناة «كادر كورة» (تريندات كورة مصرية، شورتس).
اكتب لكل منصة بالمصري، قصير جدًا، بيشد من أول كلمتين، وصادق 100% (ممنوع تهويل أو وعد مش في الفيديو أو حقيقة مش مؤكدة).
- youtube.title: ≤ 55 حرف، سؤال أو مفارقة واضحة، اسم اللاعب/النادي في الأول، من غير هاشتاجات.
- youtube.description: سطرين بالكتير بيكمّلوا الفضول + 3 هاشتاجات بس (أولهم #shorts).
- tiktok.caption: ≤ 100 حرف، سطر واحد بسؤال يفتح كومنتات + 3 هاشتاجات (واحد عام زي #كورة واتنين محددين).
- instagram.caption: أول سطر ≤ 80 حرف هو الهوك، سطر تاني فيه سؤال للتفاعل، بعدين 4 هاشتاجات.
- facebook.caption: ≤ 120 حرف، جملة + سؤال، 2 هاشتاج بس.
ممنوع في أي كابشن: روابط، أسماء جرايد، «صوت AI»، حقوق صور، كلام طويل. ممنوع كلمات بتقلل الوصول (شتيمة، عنف، مراهنات، «حصري جدًا» الكاذبة).
رجّع JSON: {"youtube":{"title":"","description":""},"tiktok":{"caption":""},"instagram":{"caption":""},"facebook":{"caption":""}}`;

export async function makeTitles({ topic, script, facts }) {
  const t = await json(`${TITLE_RULES}\n\nالموضوع: ${topic}\nنص الفيديو:\n${script}\n\nالحقائق المؤكدة:\n${facts}`, { temp: 0.7 });
  // حراس آليين: الطول والممنوعات
  const bad = /صوت|AI|https?:|Wikimedia|CC BY|المصادر|المصدر|بحسب|حقوق|Photo/i;
  const clip = (s, n) => (s || '').trim().slice(0, n);
  t.youtube = t.youtube || {};
  t.youtube.title = clip(t.youtube.title, 70);
  t.youtube.description = (t.youtube.description || '').split('\n').filter((l) => !bad.test(l)).join('\n').trim();
  for (const k of ['tiktok', 'instagram', 'facebook']) {
    t[k] = t[k] || {};
    if (bad.test(t[k].caption || '')) t[k].caption = (t[k].caption || '').split('\n').filter((l) => !bad.test(l)).join('\n').trim();
  }
  return t;
}
