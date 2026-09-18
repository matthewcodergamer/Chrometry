#!/usr/bin/env bash
set -euo pipefail
API_BASE="${CHROMETRY_API_BASE_URL:-}"
WEB_URL="${CHROMETRY_WEB_URL:-https://matthewcodergamer.github.io/Chrometry/}"
rm -rf dist/chrometry-extension
mkdir -p dist/chrometry-extension
# Generate the same Chrometry icon from the canonical SVG.
if command -v rsvg-convert >/dev/null 2>&1; then
  rsvg-convert -w 48 -h 48 chrometry-icon.svg -o dist/chrometry-extension/chrometry-48.png
  rsvg-convert -w 128 -h 128 chrometry-icon.svg -o dist/chrometry-extension/chrometry-128.png
elif command -v magick >/dev/null 2>&1; then
  magick -background none chrometry-icon.svg -resize 48x48 dist/chrometry-extension/chrometry-48.png
  magick -background none chrometry-icon.svg -resize 128x128 dist/chrometry-extension/chrometry-128.png
else
  echo "Install librsvg (rsvg-convert) or ImageMagick (magick)." >&2
  exit 1
fi
cp manifest.json extension-background.js index.html styles.css ios-polish.css app.js ui-polish.js adsense.js adsense-config.js monetization.js chrometry-icon.svg dist/chrometry-extension/
printf "window.CHROMETRY_API_BASE_URL = %s;\nwindow.CHROMETRY_WEB_URL = %s;\n" "$(printf '%s' "$API_BASE" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')" "$(printf '%s' "$WEB_URL" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')" > dist/chrometry-extension/chrometry-config.js
python3 - <<'PY'
from pathlib import Path
from urllib.parse import urlparse
import json

root=Path('dist/chrometry-extension')
manifest_path=root/'manifest.json'
manifest=json.loads(manifest_path.read_text())
api_url='${API_BASE}'
if api_url:
    parsed=urlparse(api_url)
    if parsed.scheme not in ('http','https') or not parsed.netloc:
        raise SystemExit('CHROMETRY_API_BASE_URL must be a valid http(s) URL')
    manifest['host_permissions']=[f'{parsed.scheme}://{parsed.netloc}/*']
else:
    manifest.pop('host_permissions', None)
manifest_path.write_text(json.dumps(manifest, indent=2)+'\n')

p=root/'index.html'
s=p.read_text()
needle='  <script src="./app.js"></script>'
s=s.replace(needle,'  <script src="./chrometry-config.js"></script>\n'+needle)
p.write_text(s)
PY
(
  cd dist
  rm -f chrometry-extension.zip
  zip -qr chrometry-extension.zip chrometry-extension
)
echo "Built dist/chrometry-extension.zip"
