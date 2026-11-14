#!/bin/zsh
# مفتاح Gemini خاص بكادر كورة (منفصل عن سر الموبايل). انسخ المفتاح من aistudio.google.com/apikey الأول، وبعدين شغّل ده.
set -e
K="$(pbpaste | tr -d '[:space:]')"; [[ "$K" == AIza* && ${#K} -gt 30 ]] || { echo "✗ مفيش مفتاح Gemini في الحافظة"; exit 1; }
C=$(curl -s -o /dev/null -w '%{http_code}' -H "x-goog-api-key: $K" -H 'content-type: application/json' -d '{"contents":[{"parts":[{"text":"اهلا"}]}]}' https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent)
[ "$C" = "200" ] || { echo "✗ المفتاح مش شغال (HTTP $C)"; exit 1; }
printf %s "$K" | gh secret set GEMINI_API_KEY -R ahmedmatwe/kader-kora
mkdir -p ~/.kader-kora && printf %s "$K" > ~/.kader-kora/gemini && chmod 600 ~/.kader-kora/gemini
printf '' | pbcopy; echo "✓ مفتاح Gemini بتاع كادر كورة اتحط (السحابة + الماك)"
