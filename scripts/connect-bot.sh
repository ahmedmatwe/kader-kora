#!/bin/zsh
# بيشغّل بوت تليجرام «كادر كورة» على Cloudflare (مجاني) ويربطه بالمصنع.
# قبل التشغيل: اعمل البوت من @BotFather، انسخ المفتاح، افتح البوت ودوس Start.
# التشغيل:  zsh scripts/connect-bot.sh     (أول مرة بيفتح المتصفح تسجّل دخول Cloudflare)
set -euo pipefail
REPO=ahmedmatwe/kader-kora
DIR="$(cd "$(dirname "$0")/.." && pwd)/bot"; S=~/.kader-kora
W=(npx --yes wrangler@4)
TOKEN="$(pbpaste | grep -oE '[0-9]{6,}:[A-Za-z0-9_-]{30,}' | head -1 || true)"
[ -n "$TOKEN" ] || { echo "✗ الحافظة مفيهاش مفتاح بوت — انسخ المفتاح اللي بعتهولك BotFather"; exit 1; }
NAME=$(curl -s "https://api.telegram.org/bot$TOKEN/getMe" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["result"]["username"] if d.get("ok") else "")')
[ -n "$NAME" ] || { echo "✗ تليجرام رفض المفتاح"; exit 1; }
curl -s "https://api.telegram.org/bot$TOKEN/deleteWebhook" > /dev/null
CHAT=$(cat $S/bot-chat 2>/dev/null || true)
[ -n "$CHAT" ] || CHAT=$(curl -s "https://api.telegram.org/bot$TOKEN/getUpdates" | python3 -c 'import json,sys; r=json.load(sys.stdin).get("result",[]); ids=[u.get("message",{}).get("chat",{}).get("id") for u in r if u.get("message")]; print(ids[-1] if ids else "")')
[ -n "$CHAT" ] || { echo "✗ افتح البوت @$NAME على تليجرام ودوس Start وبعدين شغّل الأمر تاني"; exit 1; }
echo "$CHAT" > $S/bot-chat; chmod 600 $S/bot-chat
echo "✓ البوت @$NAME — الشات بتاعك اتعرف"
cd "$DIR"
"${W[@]}" whoami 2>/dev/null | grep -q "associated with" || "${W[@]}" login
if grep -q REPLACE_WITH_KV_ID wrangler.toml; then
  KV=$("${W[@]}" kv namespace create KADER_MEM 2>&1 | grep -oE '[0-9a-f]{32}' | head -1 || true)
  [ -n "$KV" ] || { echo "✗ مقدرتش أعمل مخزن KV"; exit 1; }
  sed -i '' "s/REPLACE_WITH_KV_ID/$KV/" wrangler.toml
fi
URL=$("${W[@]}" deploy 2>&1 | tee /dev/stderr | grep -oE 'https://[a-z0-9.-]+\.workers\.dev' | head -1 || true)
[ -n "$URL" ] || { echo "✗ النشر على Cloudflare ما كملش"; exit 1; }
INGEST=$(openssl rand -hex 24); HOOK=$(openssl rand -hex 24)
CID=$(python3 -c 'import json,glob,os; f=sorted(glob.glob(os.path.expanduser("~/Downloads/client_secret_*.json")))[0]; j=json.load(open(f)); c=j.get("installed") or j.get("web"); print(c["client_id"]+" "+c["client_secret"])')
put() { printf %s "$2" | "${W[@]}" secret put "$1" > /dev/null; }
put TELEGRAM_BOT_TOKEN "$TOKEN"; put CHAT_ID "$CHAT"; put INGEST_SECRET "$INGEST"; put WEBHOOK_SECRET "$HOOK"
put GH_TOKEN "$(gh auth token)"; put GEMINI_API_KEY "$(paste -sd, $S/gemini)"
put META_PAGE_TOKEN "$(python3 -c "import json;print(json.load(open('$S/meta.json'))['token'])")"
put META_PAGE_ID "$(python3 -c "import json;print(json.load(open('$S/meta.json'))['pageId'])")"
put META_IG_USER_ID "$(python3 -c "import json;print(json.load(open('$S/meta.json'))['igId'])")"
put YT_REFRESH_TOKEN "$(python3 -c "import json;print(json.load(open('$S/youtube.json'))['refresh_token'])")"
put GOOGLE_CLIENT_ID "${CID% *}"; put GOOGLE_CLIENT_SECRET "${CID#* }"
printf %s "$TOKEN" | gh secret set TELEGRAM_BOT_TOKEN -R $REPO
gh secret set TELEGRAM_CHAT_ID -R $REPO -b "$CHAT"
printf '' | pbcopy
sleep 5
curl -s -X POST "$URL/setup" -H "authorization: Bearer $INGEST" | grep -q '"ok":true' && echo "✓ تليجرام اتربط" || echo "⏳ تليجرام لسه مش شايف العنوان الجديد — شغّل الأمر تاني بعد شوية"
curl -s "https://api.telegram.org/bot$TOKEN/sendMessage" -d chat_id="$CHAT" --data-urlencode text="✅ مساعد «كادر كورة» شغال! اسألني عن المتابعين أو اللي مستني نشر، أو قولّي أعمل إيه." > /dev/null
echo "✓ البوت شغال: $URL"
