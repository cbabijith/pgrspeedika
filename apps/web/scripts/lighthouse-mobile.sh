#!/usr/bin/env bash
# Lighthouse mobile audit for the Phase 5 performance gate (≥ 90).
# Usage: ./scripts/lighthouse-mobile.sh [url …]   (defaults: home + product page)
set -euo pipefail

CHROME="$HOME/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
if [[ ! -x "$CHROME" ]]; then
  CHROME="$(find "$HOME/Library/Caches/ms-playwright" -name "Google Chrome for Testing" -type f -perm +111 | head -1)"
fi

URLS=("$@")
if [ ${#URLS[@]} -eq 0 ]; then
  URLS=("http://localhost:3000/" "http://localhost:3000/products/matta-rice")
fi

OUT_DIR="lighthouse-reports"
mkdir -p "$OUT_DIR"
FAIL=0

for url in "${URLS[@]}"; do
  name=$(echo "$url" | sed -E 's#https?://##; s#[/?&=]#_#g')
  echo "── Auditing (mobile): $url"
  ./node_modules/.bin/lighthouse "$url" \
    --chrome-path="$CHROME" \
    --form-factor=mobile \
    --screenEmulation.width=412 \
    --screenEmulation.height=823 \
    --screenEmulation.deviceScaleFactor=1.75 \
    --screenEmulation.mobile=true \
    --emulatedUserAgent="Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Mobile Safari/537.36" \
    --throttling-method=simulate \
    --only-categories=performance,accessibility,best-practices,seo \
    --output=json \
    --output-path="$OUT_DIR/$name.json" \
    --chrome-flags="--headless=new --no-sandbox" \
    --quiet

  node -e "
    const report = require('./$OUT_DIR/$name.json');
    const s = report.categories;
    const row = (k) => Math.round(s[k].score * 100);
    console.log('  perf=' + row('performance') + '  a11y=' + row('accessibility') + '  bp=' + row('best-practices') + '  seo=' + row('seo'));
    const metrics = report.audits;
    console.log('  FCP=' + Math.round(metrics['first-contentful-paint'].numericValue) + 'ms' +
                '  LCP=' + Math.round(metrics['largest-contentful-paint'].numericValue) + 'ms' +
                '  TBT=' + Math.round(metrics['total-blocking-time'].numericValue) + 'ms' +
                '  CLS=' + metrics['cumulative-layout-shift'].numericValue.toFixed(3) +
                '  SpeedIndex=' + Math.round(metrics['speed-index'].numericValue) + 'ms');
    if (row('performance') < 90) process.exit(1);
  " || FAIL=1
done

if [ $FAIL -ne 0 ]; then
  echo "✗ Performance below 90 on at least one page"
  exit 1
fi
echo "✓ All audited pages meet the mobile performance ≥ 90 gate"
