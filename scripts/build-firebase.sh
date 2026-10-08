#!/usr/bin/env bash
# Rebuilds vendor/firebase.js. Usage: scripts/build-firebase.sh [firebase-version]
set -euo pipefail
VERSION="${1:-12.19.0}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cd "$TMP"
npm init -y >/dev/null
npm install --silent "firebase@$VERSION" esbuild
cp "$ROOT/scripts/firebase-entry.js" entry.js
npx esbuild entry.js --bundle --format=esm --minify --legal-comments=none \
  --banner:js="/* Firebase JS SDK $VERSION (Apache-2.0), bundled for Pump Track */" \
  --outfile="$ROOT/vendor/firebase.js"
echo "Wrote vendor/firebase.js (firebase@$VERSION)"
