#!/bin/zsh
# رندر كامل لفيديو: bash scripts/render.sh videos/01-salah-70 salah-70
set -e
cd "$(dirname "$0")/../motion"; V="../$1"; N="$2"
python3 -I ../scripts/build_plan.py "$V" >/dev/null
cp "$V/build/voice.wav" public/media/voice.wav
python3 -c "import json;p=json.load(open('$V/build/plan.json'));p['music']='media/music.mp3';json.dump(p,open('$V/build/plan-yt.json','w'),ensure_ascii=False)"
npx remotion render src/index.ts NewsShort "$V/final/$N-youtube.mp4" --props="$V/build/plan-yt.json" --codec=h264 --crf=18 --audio-bitrate=192k --log=error
npx remotion render src/index.ts NewsShort "$V/final/$N-social.mp4" --props="$V/build/plan.json" --codec=h264 --crf=18 --audio-bitrate=192k --log=error
[ -f "$V/build/plan-cover.json" ] && npx remotion still src/index.ts NewsShort "$V/final/$N-cover.jpg" --frame=35 --props="$V/build/plan-cover.json" --image-format=jpeg --jpeg-quality=92 --log=error
python3 - "$V" "$N" <<'PY'
import json,sys
V,N=sys.argv[1:]; p=json.load(open(f'{V}/build/plan.json'))
def ts(x): s=x%60; return f"{int(x//3600):02}:{int(x%3600//60):02}:{int(s):02},{int(round((s-int(s))*1000)):03}"
open(f'{V}/final/{N}.ar.srt','w').write('\n'.join(f"{i}\n{ts(c['start'])} --> {ts(c['end'])}\n{c['text'].replace('*','')}\n" for i,c in enumerate(p['captions'],1)))
PY
/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg -loglevel error -y -i "$V/final/$N-social.mp4" -vf "fps=1/2,scale=270:-1,tile=7x4" -frames:v 1 "$V/qa/frames/contact.jpg"
echo "done $N"
