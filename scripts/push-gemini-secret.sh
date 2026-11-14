#!/bin/zsh
# بيحط مفتاح Gemini (من مشروع سر البراند على الماك) في secrets ريبو كادر كورة — لفريق الردود. المفتاح ما بيظهرش.
set -e
grep '^GEMINI_API_KEY=' ~/Desktop/youtube-ai-studio/.env | cut -d= -f2- | tr -d '"' | cut -d, -f1 | tr -d '\n' | gh secret set GEMINI_API_KEY -R ahmedmatwe/kader-kora
echo "✓ مفتاح Gemini اتحط على السحابة لفريق الردود"
