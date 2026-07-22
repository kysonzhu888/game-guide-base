# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Game Guide Base is a static, evidence-backed guide site for playable Loopit games, deployed to
[gameguidebase.com](https://gameguidebase.com/) on Cloudflare Pages. All HTML under `games/`,
`genres/`, `platforms/`, `creators/`, `developers/`, `index.html`, `sitemap.xml`, etc. is
**generated** — edit the data and templates, not the output.

## Commands

```bash
npm test                 # node --test tools/*.test.mjs (no dependencies to install; plain Node)
npm run build            # node tools/build.mjs — regenerates all pages from data/
npm run package:deploy   # node tools/build-deploy.mjs — assembles allowlisted .deploy/ package
npm run verify:daily     # node tools/verify-daily-guides.mjs (needs --before-ref, --evidence-root, etc.)
tools/start-local.sh     # build + local D1 schema + wrangler pages dev on port 4176
```

Run a single test file with `node --test tools/daily-guide-verifier.test.mjs`.

There is no `node_modules`; the project has zero npm dependencies and uses only Node built-ins
(`type: "module"`, `.mjs` everywhere).

## Architecture

### Content pipeline (the core flow)

1. `data/games.json` — array of ~100 guide objects (slug, title, genre, creator, stats,
   summary, quickAnswer, basics, controls, steps, faq, screenshots, coverage history...).
   This is the single source of truth for guide content.
2. `data/media.json` + `data/media-assets.generated.json` — screenshot metadata and the
   generated manifest mapping local `assets/<game-slug>/NN-step.png` files to optimized R2
   URLs (`media.gameguidebase.com`). Manifest entries are produced by `tools/prepare-media.mjs`;
   missing entries fall back to local assets.
3. `site.config.json` — site URLs, `mediaBaseUrl`/`mediaVersion`, AdSense IDs, and the
   `paywall` block (Lemon Squeezy product, free-guide limit, access-code hashes).
4. `tools/build.mjs` reads all of the above and regenerates: home page, per-game pages,
   genre/platform/creator index pages, utility pages, `sitemap.xml`, `robots.txt`, `ads.txt`,
   `404.html`, the public API catalog (`api/v1/games.json` via `tools/lib/public-catalog.mjs`),
   and `functions/_generated/premium-content.js` (premium guide bodies served only after
   license validation, so locked pages never ship full content in static HTML).
5. `tools/build-deploy.mjs` (via `tools/lib/deploy-package.mjs`) copies an explicit allowlist
   of runtime files into `.deploy/`. Source data (`data/`), `tools/`, raw `assets` media,
   Markdown, `.git`, and `.wrangler` are deliberately excluded — never add them back.

Guide freshness dates come from coverage/update history (`tools/update-history.mjs`), never
from build time.

### Cloudflare runtime

- `wrangler.toml` deploys `.deploy/` to Pages with a D1 binding `COMMENTS_DB` (schema in
  `schema.sql`).
- `functions/api/comments.js` — D1-backed comments with email notification via Resend.
- `functions/api/license.js` + `functions/api/premium.js` — Lemon Squeezy license validation
  that unlocks premium content from the generated module.
- `script.js` — client-side search/filtering and the paywall/license UI.

### Daily automation

`.github/workflows/daily-five-guides.yml` runs daily at 03:17 Asia/Shanghai on a trusted
self-hosted Mac runner (`kysonde-game-guide-base`). It plays games for real (Codex + Chrome
extension backend), produces exactly five new guides with screenshot/video evidence, files a
Linear child issue under `UCH-41`, merges a dated PR, and deploys. Each run writes a manifest
to `data/daily-runs/<date>.json`, which `tools/verify-daily-guides.mjs` validates against the
pre-run `origin/main` baseline (new-guide count, no fabricated evidence, media manifest
consistency). The agent prompt is `.github/prompts/daily-five-guides.md`. Scheduled runs are
`full`; manual dispatch defaults to `preflight`. `.github/workflows/deploy-production.yml`
redeploys on every push to `main`.

The runner's credentials (Codex, Linear token, Wrangler OAuth, R2) live only on the Mac host
and are intentionally not in GitHub secrets.

### Media rules (see MEDIA_RULES.md for details)

- Source screenshots: `assets/<game-slug>/<NN>-<short-step>.png`; published derivatives go to
  R2 as 1200px-wide JPEGs under `games/<platform-slug>/<game-slug>/screenshots/`.
- `.media/` holds generated optimized media and must never be deployed to Pages.
- Keep guides to 4–6 screenshots unless the game meaningfully branches.

## Content integrity rules

Guides are evidence-backed: never invent play results, routes, creators, stats, screenshots,
or outcomes. New guides require real gameplay evidence; coverage refreshes of existing guides
do not count as new guides.
