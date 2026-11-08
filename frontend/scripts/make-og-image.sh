#!/bin/sh
# Builds public/og.png, the image link previews show (Slack, WhatsApp, X,
# LinkedIn). Run it after changing the wordmark, the tagline or the palette:
#
#   sh scripts/make-og-image.sh
#
# Needs ImageMagick and rsvg-convert, which are not part of the web build:
# the finished PNG is committed, so nothing else has to render it.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
out="$root/public/og.png"
logo_font="$root/src/assets/fonts/peace_sans/Peace Sans Webfont.ttf"

if ! command -v magick >/dev/null 2>&1; then
  echo "ImageMagick (magick) is required to build the social preview image" >&2
  exit 1
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

rsvg-convert -w 132 -h 132 "$root/public/favicon.svg" -o "$tmp/mark.png"

magick -size 1200x630 xc:'#f4f2ef' \
  "$tmp/mark.png" -geometry +96+96 -composite \
  -font "$logo_font" -pointsize 104 -fill '#141218' -annotate +96+340 'Dirah' \
  -font 'DejaVu-Serif' -pointsize 46 -fill '#3d3a36' -annotate +96+424 'A context bank for your AI agents.' \
  -font 'DejaVu-Sans' -pointsize 28 -fill '#6d6862' \
  -annotate +96+486 'Docs, specs and decisions your agents can read and write.' \
  -fill '#d8d3cb' -draw 'rectangle 96,540 1104,542' \
  -strip -quality 92 "$out"

# App and touch icons: the mark on the page background, so they are not
# transparent on a dark home screen.
for size in 180 192 512; do
  rsvg-convert -w "$size" -h "$size" "$root/public/favicon.svg" -o "$tmp/mark-$size.png"
  magick -size "${size}x${size}" xc:'#f4f2ef' \
    "$tmp/mark-$size.png" -geometry "+$((size / 8))+$((size / 8))" -composite \
    -strip "$root/public/icon-$size.png"
done
cp "$root/public/icon-180.png" "$root/public/apple-touch-icon.png"

echo "wrote $out"
