#!/bin/zsh
# ربط صفحة فيس «كادر كورة» + إنستجرام @kader_kora. انسخ المفتاح الطويل (بعد Extend) في الحافظة الأول.
# المفتاح ما بيظهرش على الشاشة، وبيتحط في secrets الريبو الخاص + نسخة على الماك في ~/.kader-kora/meta.json
set -e
R=ahmedmatwe/kader-kora; V=v27.0
U="$(pbpaste | tr -d '[:space:]')"; [ ${#U} -gt 50 ] || { echo "✗ مفيش مفتاح في الحافظة"; exit 1; }
OUT=$(curl -s "https://graph.facebook.com/$V/me/accounts?fields=id,name,access_token,instagram_business_account%7Busername%7D&limit=100&access_token=$U")
read PID PTOKEN IGID IGU NAME <<< $(printf %s "$OUT" | python3 -c '
import json,sys; d=json.load(sys.stdin); ps=d.get("data",[])
p=[x for x in ps if "كادر" in x["name"] or "kader" in x["name"].lower()] or ps
if not p: print("- - - - -"); sys.exit()
p=p[0]; ig=p.get("instagram_business_account") or {}
print(p["id"], p["access_token"], ig.get("id","-"), ig.get("username","-"), p["name"].replace(" ","_"))')
[ "$PID" != "-" ] || { echo "✗ المفتاح مش شايف أي صفحة — اتأكد إنك اخترت صفحة كادر كورة وإدّيت الصلاحيات"; exit 1; }
[ "$IGID" != "-" ] || echo "⚠️ الصفحة مش مربوط بيها حساب إنستجرام احترافي (Business/Creator)"
EXP=$(curl -s "https://graph.facebook.com/$V/debug_token?input_token=$PTOKEN&access_token=$PTOKEN" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("data",{}).get("expires_at","?"))')
printf %s "$PTOKEN" | gh secret set META_PAGE_TOKEN -R $R
gh secret set META_PAGE_ID -R $R -b "$PID"; gh secret set META_IG_USER_ID -R $R -b "$IGID"
mkdir -p ~/.kader-kora && python3 -c "import json,sys,os; p=os.path.expanduser('~/.kader-kora/meta.json'); json.dump({'token':sys.argv[1],'pageId':sys.argv[2],'igId':sys.argv[3]},open(p,'w')); os.chmod(p,0o600)" "$PTOKEN" "$PID" "$IGID"
printf '' | pbcopy
echo "✓ اتربطت الصفحة: ${NAME//_/ }"; echo "  إنستجرام: @$IGU"
[ "$EXP" = "0" ] && echo "  المفتاح: دائم" || echo "  ⚠️ المفتاح بينتهي (expires_at=$EXP)"
