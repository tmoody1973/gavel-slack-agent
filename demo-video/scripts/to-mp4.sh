#!/bin/bash
# Playwright records webm; HyperFrames compositions get clean H.264.
set -euo pipefail
cd "$(dirname "$0")/../captures"
for f in s*.webm; do
  ffmpeg -y -i "$f" -c:v libx264 -crf 18 -preset fast -r 30 -an "${f%.webm}.mp4"
done
ls -la s*.mp4
