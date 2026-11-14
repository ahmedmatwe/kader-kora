#!/bin/zsh
# بيضيف مفتاح Gemini لكادر كورة (كل مرة مفتاح واحد من الحافظة — ممكن 2 أو 3 من مشاريع Google مختلفة).
# المفاتيح بتتحفظ في ~/.kader-kora/gemini + secret GEMINI_API_KEY (مفصولة بفاصلة). مفتاح سر الموبايل مش بيدخل هنا.
set -e
K="$(pbpaste | tr -d '[:space:]')"; [[ ( "$K" == AIza* || "$K" == AQ.* ) && ${#K} -gt 30 ]] || { echo "✗ مفيش مفتاح Gemini في الحافظة"; exit 1; }
C=$(curl -s -o /dev/null -w '%{http_code}' -H "x-goog-api-key: $K" -H 'content-type: application/json' -d '{"contents":[{"parts":[{"text":"اهلا"}]}]}' https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent)
[[ "$C" = "200" || "$C" = "429" ]] || { echo "✗ المفتاح مش شغال (HTTP $C)"; exit 1; }
SER="$(grep -E '^GEMINI_API_KEY(_2)?=' ~/Desktop/youtube-ai-studio/.env 2>/dev/null | cut -d= -f2- | tr -d '" ' | tr ',' '\n')"
echo "$SER" | grep -qxF "$K" && { echo "✗ ده مفتاح سر الموبايل — هات مفتاح من مشروع جديد"; exit 1; }
F=~/.kader-kora/gemini; mkdir -p ~/.kader-kora; touch $F; chmod 600 $F
{ cat $F | tr ',' '\n'; echo "$K"; } | grep -E '^(AIza|AQ\.)' | awk '!s[$0]++' > $F.tmp && mv $F.tmp $F && chmod 600 $F
paste -sd, $F | tr -d '\n' | gh secret set GEMINI_API_KEY -R ahmedmatwe/kader-kora
printf '' | pbcopy; echo "✓ اتضاف — عدد مفاتيح كادر كورة دلوقتي: $(wc -l < $F | tr -d ' ')"
