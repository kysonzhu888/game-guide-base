# Game Guide Base

Game Guide Base is a static, evidence-backed guide site for playable Loopit games. The public
site is deployed to [gameguidebase.com](https://gameguidebase.com/).

## Daily five-guide automation

The production pipeline lives in
`.github/workflows/daily-five-guides.yml` and runs every day at **03:17 Asia/Shanghai** on the
trusted `kysonde-game-guide-base` self-hosted Mac runner. GitHub Actions provides the schedule,
logs, concurrency control, artifacts, and deterministic verification. The trusted Mac provides
the signed-in browser, local Codex runtime, Uchuu Linear token, R2 media access, and Wrangler
OAuth session needed for real gameplay and deployment.

The scheduled run is always `full`. A manual dispatch defaults to `preflight`, which checks the
host, browser runtime, Linear workspace, build, tests, and deployment package without changing
site content.

A full run must:

1. create or reuse a daily Linear child issue under `UCH-41` before editing content;
2. discover and genuinely play enough candidates to produce exactly five new guides;
3. retain screenshots for static games and video plus frames for dynamic games;
4. merge a dated PR only after content, media, and site checks pass;
5. pass `tools/verify-daily-guides.mjs` against the immutable pre-run baseline;
6. deploy the allowlisted `.deploy` package and probe every new public guide URL.

Coverage refreshes, duplicate sources, blocker-only pages, missing evidence, fabricated outcomes,
and fewer than five new guides fail the run before deployment. Gameplay and diagnostic artifacts
are retained by GitHub for 30 days. The daily Linear issue stays In Progress on a blocked run and
moves to In Review only after handoff; automation never marks it Done.

The host must be online and awake for the scheduled run. Its local Codex, browser backend,
`~/.linear/api_token`, and Wrangler login are intentionally not copied into GitHub secrets.

## Local verification

```bash
npm test
npm run build
npm run package:deploy
```

To validate a completed daily run:

```bash
node tools/verify-daily-guides.mjs \
  --before-ref <baseline-sha> \
  --after-ref <merged-main-sha> \
  --date YYYY-MM-DD \
  --evidence-root <artifact-directory> \
  --expected-count 5
```

The deployment packager copies only public runtime files and explicitly excludes source data,
tools, raw media, logs, and repository metadata.
