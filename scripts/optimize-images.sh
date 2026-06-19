#!/usr/bin/env bash
# Asset pipeline for cliftonhatfield.com — sources optimized icons/screenshots/og
# from the local app repos into assets/img and assets/favicon.
# Tools: sips (resize), cwebp + avifenc (modern formats), magick (rasterize SVG/og).
# Idempotent: safe to re-run. Outputs only land under assets/.
set -euo pipefail
cd "$(dirname "$0")/.."

IMG=assets/img
FAV=assets/favicon
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

APPS="/Users/cliftonhatfield/Apps"
DRIFT="$APPS/drift"
WAU="$APPS/we-are-united"
RETRO="$APPS/retrostack"
OBIT="$APPS/write_an_obituary"

# encode <src-png-or-jpg> <out-basename-without-ext> <quality>
encode() {
  local src="$1" out="$2" q="${3:-82}"
  cwebp -quiet -q "$q" "$src" -o "$IMG/$out.webp"
  avifenc --min 20 --max 40 -s 6 "$src" "$IMG/$out.avif" >/dev/null 2>&1 || \
    avifenc "$src" "$IMG/$out.avif" >/dev/null 2>&1 || true
  echo "  -> $out.webp $( [ -f "$IMG/$out.avif" ] && echo '+ .avif')"
}

# resize a square-ish icon to N px (keeps aspect), writes png to $TMP/$2.png
resize_png() {
  local src="$1" name="$2" px="$3"
  cp "$src" "$TMP/$name-src"
  sips -Z "$px" "$TMP/$name-src" --out "$TMP/$name.png" >/dev/null
  echo "$TMP/$name.png"
}

echo "AGNTS hero feed screenshot (already 540x1170 webp) ->"
cp "$DRIFT/landing/demo/dark/04-feed.webp" "$IMG/agnts-feed.webp"
cp "$DRIFT/landing/demo/dark/02-thread.webp" "$IMG/agnts-thread.webp"

echo "We Are United icon — red/white/blue flame mark, transparent (-> 256) ->"
WAU_ICON="$APPS/united-apps/we-are-united/web/icons/Icon-512.png"
[ -f "$WAU_ICON" ] || WAU_ICON="$WAU/assets/icons/icon.png"
encode "$(resize_png "$WAU_ICON" wau 256)" project-weareunited 88

echo "RetroStack logo (128) ->"
encode "$RETRO/assets/images/logo.png" project-retrostack 88

echo "Write an Obituary logo.svg (rasterize -> 256 png) ->"
magick -background none "$OBIT/images/logo.svg" -resize 256x256 "$TMP/obit.png" 2>/dev/null \
  || cp "$OBIT/images/phone.png" "$TMP/obit.png"
encode "$TMP/obit.png" project-obituary 86

echo "Favicons (from brand favicon.svg) ->"
cp "$DRIFT/landing/favicon.svg" "$FAV/favicon.svg"
magick -background none "$FAV/favicon.svg" -resize 32x32   "$FAV/favicon-32.png" 2>/dev/null || true
magick -background none "$FAV/favicon.svg" -resize 180x180 "$FAV/apple-touch-icon.png" 2>/dev/null || true
magick -background none "$FAV/favicon.svg" -resize 192x192 "$FAV/icon-192.png" 2>/dev/null || true
magick -background none "$FAV/favicon.svg" -resize 512x512 "$FAV/icon-512.png" 2>/dev/null || true

echo "Open Graph card (1200x630, generated) ->"
magick -size 1200x630 "xc:#0F1115" \
  -fill "#1c1f26" -draw "roundrectangle 56,56 1144,574 24,24" \
  -fill none -stroke "#2a2f38" -strokewidth 2 -draw "roundrectangle 56,56 1144,574 24,24" \
  -font Helvetica-Bold -fill "#ffffff" -pointsize 96 -gravity West -annotate +120+-70 "AGNTS" \
  -font Helvetica -fill "#aeb4bf" -pointsize 36 -gravity West -annotate +124+10 "A runtime for persistent AI personas" \
  -font Helvetica -fill "#aeb4bf" -pointsize 36 -gravity West -annotate +124+58 "you can invoke over an API." \
  -fill "#ff4d4d" -draw "rectangle 124,296 250,306" \
  -font Helvetica -fill "#aeb4bf" -pointsize 28 -gravity SouthWest -annotate +124+96 "cliftonhatfield.com  ·  Clifton Hatfield" \
  "$TMP/og.png" 2>/dev/null && cp "$TMP/og.png" "$IMG/og.png" && cwebp -quiet -q 86 "$TMP/og.png" -o "$IMG/og.webp" \
  || echo "  (og generation skipped — magick text unavailable)"

echo "Done. Outputs:"; ls -lh "$IMG" "$FAV"