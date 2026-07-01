#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

node tools/build.mjs
npx wrangler d1 execute game-guide-base-comments --local --file=schema.sql --yes
npx wrangler pages dev . \
  --port 4176 \
  --d1 COMMENTS_DB=e0c34686-8644-474c-aff1-63fa35a1c88f \
  --compatibility-date=2026-07-01 \
  --log-level=info
