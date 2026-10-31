#!/bin/sh
set -eu
npm ci --prefix web
USB_AI_WEB_BASE=/app/ npm run build --prefix web
mkdir -p .vercel-static/app
cp index.html landing-i18n.js landing-mobile-gate.js landing-demo.js robots.txt sitemap.xml .vercel-static/
cp -R web/dist/. .vercel-static/app/
python3 scripts/build-prism-web.py
