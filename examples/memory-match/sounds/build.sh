#!/bin/bash
# Rebuilds public/sounds/*.mp3 from their CC0 / public-domain sources (see LICENSES.md).
# Needs curl, ffmpeg (with libmp3lame) and python3. Run from anywhere:
#   bash examples/memory-match/sounds/build.sh
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
out="$here/../public/sounds"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$out"
ua='bitgames-sound-build/1.0 (https://bitgames.store)'

# Optional SOUND_IDS=dog,cow,pig selects calls; SOUND_SOURCE_DIR uses checksummed local <name>.src downloads.
# name | original file URL | sha256 of the original | start s | length s | filters | extra gain dB
while IFS='|' read -r name url sha ss len filters trim; do
  [ -z "$name" ] && continue
  [[ -n "${SOUND_IDS:-}" && ",${SOUND_IDS}," != *",${name},"* ]] && continue
  src="$tmp/$name.src"
  if [[ -n "${SOUND_SOURCE_DIR:-}" ]]; then
    cp "$SOUND_SOURCE_DIR/$name.src" "$src"
  else
    curl --max-time 45 --retry 2 -sfL -A "$ua" -o "$src" "$url"
  fi
  echo "$sha  $src" | sha256sum -c --quiet
  fade=$(python3 -c "print(max(0, $len - 0.18))")
  ffmpeg -v error -y -ss "$ss" -t "$len" -i "$src" -ac 1 -ar 44100 \
    -af "$filters,afade=t=in:d=0.015,afade=t=out:st=$fade:d=0.18" "$tmp/$name.wav"
  peak=$(ffmpeg -i "$tmp/$name.wav" -af volumedetect -f null - 2>&1 | awk '/max_volume/ {print $5}')
  gain=$(python3 -c "print(-1.5 - ($peak) + ($trim))")
  ffmpeg -v error -y -i "$tmp/$name.wav" -af "volume=${gain}dB" -codec:a libmp3lame -b:a 64k "$out/$name.mp3"
  echo "$name.mp3"
  sleep 3 # Wikimedia asks for gentle request rates
done <<'LIST'
elephant|https://upload.wikimedia.org/wikipedia/commons/4/40/Elephant_voice_-_trumpeting.ogg|e5f3120e5eaca87cc080bbf57bd185c96d52fd0f63cc1dfe33228c8bfa29f3bc|0.12|1.15|highpass=f=250,highpass=f=250|0
lion|https://upload.wikimedia.org/wikipedia/commons/7/7d/Lion_raring-sound1TamilNadu178.ogg|ab237d0f960e83412251d0c11f69959f3c2e8d3b14595f7181c3056f7fa18bf7|4.85|1.75|highpass=f=70,lowpass=f=5000|-7
cat|https://upload.wikimedia.org/wikipedia/commons/8/81/Meow_of_a_Siamese_cat_-_freemaster2.wav|c5ae80383913b599b697bdb03481807dce908b44497f68583183530c6490f9d4|0.22|0.92|highpass=f=300|-2.5
chick|https://upload.wikimedia.org/wikipedia/commons/a/a9/%E0%A6%AE%E0%A7%81%E0%A6%B0%E0%A6%97%E0%A6%BF%E0%A6%B0_%E0%A6%AC%E0%A6%BE%E0%A6%9A%E0%A7%8D%E0%A6%9A%E0%A6%BE%E0%A6%B0_%E0%A6%A1%E0%A6%BE%E0%A6%95.oga|7ff4f4247253328c6e29c5694ba5d8028f6aa2ab1b18043807981496cf47f188|2.0|1.5|highpass=f=1800,highpass=f=1800|0
frog|https://upload.wikimedia.org/wikipedia/commons/4/47/Laubfrosch_Balzruf.OGG|88a7541190f33708f430a4f4a22d386214dd4caf3ea3ba65dbcb76c69aab79fd|0.35|1.2|highpass=f=600|-3.5
dog|https://bigsoundbank.com/UPLOAD/ogg/0682.ogg|b47562610e197af884e59463fe9279dd6942c0aafd193ae8c66bf2267834c57a|0.27|0.9|highpass=f=150,lowpass=f=6500|-2
cow|https://bigsoundbank.com/UPLOAD/ogg/2386.ogg|e48806d1ddc3858e5856bda3df62dcff9caf1190bb3ad192af3c3ea42ae7c450|0.4|1.75|highpass=f=90,lowpass=f=5000|-3
pig|https://freesound.org/data/previews/233/233169_4056007-hq.mp3|6b2f81fa56b2c977a6c4038389371a3cf62ed6e0b7b8c6e20786c487a48e3426|0|0.65|highpass=f=100,lowpass=f=6000|-3
LIST
