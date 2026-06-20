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

echo "Open Graph card (1200x630, rendered from scripts/og-card.html) ->"
# The card uses the brand font (Space Grotesk) + the headshot, so we render the
# HTML template with headless Chrome and downscale a 2x screenshot to 1200x630.
# Edit scripts/og-card.html to change the card. Falls back to keeping the
# existing og.png if no Chrome is available (rather than overwriting it).
OG_HTML="scripts/og-card.html"
CHROME=""
for cand in \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium" \
  "$(command -v chromium 2>/dev/null || true)" \
  "$(command -v google-chrome 2>/dev/null || true)"; do
  if [ -n "$cand" ] && [ -x "$cand" ]; then CHROME="$cand"; break; fi
done

PYTHON="$(command -v python3 2>/dev/null || true)"
if [ -n "$CHROME" ] && [ -f "$OG_HTML" ] && [ -n "$PYTHON" ]; then
  OG_PORT="$("$PYTHON" - <<'PY'
import socket
s = socket.socket()
s.bind(('127.0.0.1', 0))
print(s.getsockname()[1])
s.close()
PY
)"
  "$PYTHON" -m http.server "$OG_PORT" --bind 127.0.0.1 --directory . >/dev/null 2>&1 &
  OG_SRV=$!
  sleep 1
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
    --window-size=1200,630 --screenshot="$TMP/og@2x.png" \
    "http://127.0.0.1:$OG_PORT/$OG_HTML" >/dev/null 2>&1 || true
  kill "$OG_SRV" >/dev/null 2>&1 || true
  wait "$OG_SRV" >/dev/null 2>&1 || true
  if [ -s "$TMP/og@2x.png" ] && command -v magick >/dev/null 2>&1; then
    if magick "$TMP/og@2x.png" -resize 1200x630 -background "#0F1115" -alpha remove -alpha off -strip "$TMP/og.png" 2>/dev/null; then
      cwebp -quiet -q 88 "$TMP/og.png" -o "$TMP/og.webp"
      mv "$TMP/og.png" "$IMG/og.png"
      mv "$TMP/og.webp" "$IMG/og.webp"
      echo "  -> og.png + og.webp (rendered with Space Grotesk)"
    else
      echo "  (og render failed — kept existing $IMG/og.png)"
    fi
  else
    echo "  (og render failed — kept existing $IMG/og.png)"
  fi
else
  echo "  (headless Chrome, python3, or $OG_HTML missing — kept existing $IMG/og.png)"
fi

echo "Done. Outputs:"; ls -lh "$IMG" "$FAV"