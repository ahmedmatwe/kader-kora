#!/bin/zsh
# بينقل مفاتيح يوتيوب لـsecrets الريبو الخاص (من غير ما تظهر على الشاشة). شغّله إنت مرة واحدة.
set -e
R=ahmedmatwe/kader-kora
F=$(ls ~/Downloads/client_secret_*.json | head -1)
python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['installed']['client_id'],end='')" "$F" | gh secret set GOOGLE_CLIENT_ID -R $R
python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['installed']['client_secret'],end='')" "$F" | gh secret set GOOGLE_CLIENT_SECRET -R $R
python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/.kader-kora/youtube.json')))['refresh_token'],end='')" | gh secret set YT_REFRESH_TOKEN -R $R
echo "✓ مفاتيح يوتيوب اتحطت في الريبو:"; gh secret list -R $R
