#!/usr/bin/env bash
set -euo pipefail

PRG_URL="https://opendata.geoportal.gov.pl/prg/adresy/adruni/POLSKA.zip"
PRG_IMPORT_DIR="/var/prg/imports"
STATE_DIR="/var/prg/state"
TMP_DIR="/tmp"

mkdir -p "$PRG_IMPORT_DIR"
mkdir -p "$STATE_DIR"

ts="$(date -u +"%Y%m%dT%H%M%SZ")"
tmp="$TMP_DIR/prg_${ts}.zip"
sha_file="$STATE_DIR/last.sha256"

echo "[PRG] Downloading: $PRG_URL"

curl -fL --retry 5 --retry-delay 3 \
  --connect-timeout 10 --max-time 3600 \
  -o "$tmp" \
  "$PRG_URL"

new_sha="$(sha256sum "$tmp" | awk '{print $1}')"
old_sha="$(cat "$sha_file" 2>/dev/null || true)"

if [[ "$new_sha" == "$old_sha" ]]; then
  echo "[PRG] No change detected (sha=$new_sha)"
  rm -f "$tmp"
  exit 0
fi

dest="$PRG_IMPORT_DIR/${ts}__POLSKA.zip"
mv "$tmp" "$dest"

echo "$new_sha" > "$sha_file"

echo "[PRG] Saved: $dest"
echo "[PRG] sha256=$new_sha"