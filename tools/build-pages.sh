#!/bin/sh
# Builds a static copy of the game (for GitHub Pages or any static host) into $2 (default _site).
#   tools/build-pages.sh https://game.example.com/   -> leaderboards talk to that server (it needs CORS_ORIGINS=<this site>)
#   tools/build-pages.sh none                         -> offline: progress stays in the browser, no leaderboards
set -eu
API=${1:?usage: build-pages.sh <api-url-with-trailing-slash | none> [outdir]}
OUT=${2:-_site}
case "$API" in none|https://*/) ;; *) echo "API must be 'none' or an https URL ending with /" >&2; exit 1 ;; esac
rm -rf "$OUT" && mkdir -p "$OUT/shared"
cp -R public/. "$OUT/"
cp shared/sim.js shared/maps.json shared/skins.js "$OUT/shared/"
CONNECT="'self'"; [ "$API" = none ] || CONNECT="'self' ${API%/}"
# static hosts can't send our CSP header, so it goes into a meta tag (frame-ancestors is header-only and is dropped)
CSP="default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src $CONNECT; font-src 'self'; media-src 'self' blob:; base-uri 'none'; form-action 'self'"
sed -i.bak "s|<meta name=\"slappy-api\" content=\"\">|<meta name=\"slappy-api\" content=\"$API\">\n<meta http-equiv=\"Content-Security-Policy\" content=\"$CSP\">|" "$OUT/index.html" && rm "$OUT/index.html.bak"
grep -q "content=\"$API\"" "$OUT/index.html" || { echo "failed to set the API url" >&2; exit 1; }
echo "built $OUT (api: $API)"
