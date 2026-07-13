# Game Guide Base Media Rules

## Storage

- HTML, CSS, JavaScript, functions, metadata, and sitemap stay on Cloudflare Pages.
- Published guide screenshots go to Cloudflare R2 bucket `gameguidebase-media`.
- The planned public media host is `https://media.gameguidebase.com`.
- Local fallback screenshots stay under `assets/<game-slug>/` so the site can build before R2 is enabled.
- Generated optimized media lives in `.media/` and must not be deployed to Pages.

## Naming

Source screenshots:

```text
assets/<game-slug>/<NN>-<short-step>.png
```

Examples:

```text
assets/loopit-peel-the-fruit/01-blueberry-start.png
assets/loopit-peel-the-fruit/04-perfect-peel.png
```

R2 optimized screenshots:

```text
games/<platform-slug>/<game-slug>/screenshots/<NN>-<short-step>-1200w.jpg
```

Examples:

```text
games/loopit/loopit-peel-the-fruit/screenshots/01-blueberry-start-1200w.jpg
games/loopit/loopit-surgery-incision/screenshots/05-patient-healed-1200w.jpg
```

Raw playthrough videos are not published by default. If we decide to archive them later:

```text
games/<platform-slug>/<game-slug>/raw/run-01.mp4
games/<platform-slug>/<game-slug>/frames/<run-id>/<NN>-<event>.jpg
```

## Optimization

- Default screenshot derivative: JPEG, max width `1200px`, quality `82`.
- Use `node tools/prepare-media.mjs` to generate `.media/` and `data/media-assets.generated.json`.
- Use `node tools/upload-media.mjs` after R2 is enabled.
- Keep each published guide to 4-6 screenshots unless the game has meaningful branches.
- Keep original temporary videos and dense extracted frames outside the site directory unless they are intentionally archived.

## Build Behavior

- `site.config.json.mediaBaseUrl` empty: generated pages use local `assets/...`.
- `site.config.json.mediaBaseUrl` set: screenshots with a generated manifest entry use the remote R2 URL.
- Missing manifest entries fall back to local assets instead of breaking the page.

## Release Checklist

1. Capture real screenshots from gameplay.
2. Name source screenshots as `NN-short-step.png`.
3. Run `node tools/prepare-media.mjs`.
4. Review size output and spot-check visual quality.
5. Upload with `node tools/upload-media.mjs`.
6. Set `mediaBaseUrl` only after R2/custom domain is live.
7. Run `node tools/build.mjs`.
8. Deploy with a clean `.deploy/` that excludes `.media`, `assets` when remote media is active, `tools`, `data`, Markdown, and local config.
9. Always exclude `.git` and `.wrangler` from `.deploy/`; direct upload will otherwise waste upload quota on repository internals.
