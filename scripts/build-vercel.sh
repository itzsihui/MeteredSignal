#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

npm run build:web

rm -rf public
mkdir -p public/demo public/landing/assets

# Marketing landing at /
cp landing/index.html public/index.html
cp -R landing/assets/. public/landing/assets/

# React demo at /demo (Vite absolute /assets → also copy to public/assets)
cp packages/web/dist/index.html public/demo/index.html
cp -R packages/web/dist/assets public/assets
mkdir -p public/demo/assets
# Keep relative fallback if needed
cp -R packages/web/dist/assets/. public/demo/assets/ 2>/dev/null || true

# Favicons from vite build if present
cp packages/web/dist/favicon.svg public/favicon.svg 2>/dev/null || true
cp packages/web/dist/icons.svg public/icons.svg 2>/dev/null || true

echo "✓ public/ ready for Vercel static + api/"
