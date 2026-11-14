# مكتبة موشن «كادر كورة» (Remotion)
- `src/templates/brand.tsx`: الألوان والخط والمناطق الآمنة (فوق 220، تحت 1480، ويمين 180 بعيد عن أزرار المنصات) + `Num` للأرقام (معزولة عن الـbidi).
- `src/templates/parts.tsx`: شريط التريند، العلامة المائية، شريط المصادر، الترجمة المحروقة (*كلمة* = دهبي)، وشارة «صورة أرشيفية/رسم توضيحي» + الحقوق.
- `src/templates/scenes.tsx`: المشاهد:
  - `photo`: صورة + Ken Burns + بادج + عنوان
  - `score`: نتيجة ماتش (كل رقم جنب فريقه)
  - `versus`: مقارنة رقمين بعدّاد
  - `claim`: رقم واحد ومصدره
  - `flashback`: رجوع بالزمن (خط زمني)
  - `subs`: عدّاد أيقونات
  - `verdict`: «لو… / لو…»
  - `end`: الماتش الجاي + سؤال الكومنتات
- كل فيديو ليه `scenes.json` (كل مشهد مربوط بسطور الصوت `from`/`to`) و`script.json`. بعدها:
```
python3 scripts/build_plan.py videos/<v>     # الصوت + الأوقات + الترجمة
npx remotion render src/index.ts NewsShort out.mp4 --props=../videos/<v>/build/plan.json
```
- المقاس الحالي رأسي 1080×1920 بس. قوالب المربع والأفقي لسه ما اتعملتش.
