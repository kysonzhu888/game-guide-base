#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/promo/output"
TMP_DIR="$ROOT_DIR/promo/.tmp"

mkdir -p "$OUT_DIR" "$TMP_DIR"
rm -f "$TMP_DIR"/*.mp4 "$TMP_DIR"/concat.txt

make_segment() {
  local image="$1"
  local duration="$2"
  local output="$3"

  ffmpeg -y -loop 1 -t "$duration" -i "$image" \
    -f lavfi -t "$duration" -i anullsrc=channel_layout=stereo:sample_rate=44100 \
    -vf "scale=1080:1920,format=yuv420p" \
    -map 0:v -map 1:a -r 30 -c:v libx264 -preset medium -crf 19 -c:a aac -b:a 96k -shortest "$output"
}

for i in 0 1 2 3 4; do
  test -f "$TMP_DIR/slide$i.png" || {
    echo "Missing $TMP_DIR/slide$i.png"
    echo "Render slides.html to PNG first."
    exit 1
  }
done

make_segment "$TMP_DIR/slide0.png" 3.6 "$TMP_DIR/seg0.mp4"
make_segment "$TMP_DIR/slide1.png" 3.4 "$TMP_DIR/seg1.mp4"
make_segment "$TMP_DIR/slide2.png" 3.2 "$TMP_DIR/seg2.mp4"
make_segment "$TMP_DIR/slide3.png" 3.2 "$TMP_DIR/seg3.mp4"
make_segment "$TMP_DIR/slide4.png" 3.6 "$TMP_DIR/seg4.mp4"

for seg in "$TMP_DIR"/seg*.mp4; do
  printf "file '%s'\n" "$seg" >> "$TMP_DIR/concat.txt"
done

ffmpeg -y -f concat -safe 0 -i "$TMP_DIR/concat.txt" \
  -c:v libx264 -preset medium -crf 18 -c:a aac -b:a 96k -movflags +faststart \
  "$OUT_DIR/game-guide-base-tiktok-hook-v2.mp4"

ffmpeg -y -ss 00:00:00.8 -i "$OUT_DIR/game-guide-base-tiktok-hook-v2.mp4" \
  -frames:v 1 "$OUT_DIR/game-guide-base-tiktok-hook-v2-cover.jpg"

echo "$OUT_DIR/game-guide-base-tiktok-hook-v2.mp4"
echo "$OUT_DIR/game-guide-base-tiktok-hook-v2-cover.jpg"
