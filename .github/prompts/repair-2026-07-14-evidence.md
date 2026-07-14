# GameGuideBase 2026-07-14 evidence repair

Repair only the continuous gameplay evidence for the five already-published 2026-07-14 guides.
Do not modify repository files, guide content, Git state, GitHub, Linear, Cloudflare, or R2. Do not
create any additional guides. Work only in the supplied evidence root.

Repository: `__REPOSITORY_PATH__`

Evidence root: `__REPAIR_EVIDENCE_DIR__`

First run the verifier command at the end of this prompt before initializing Chrome. If it passes,
the existing evidence is already valid: do not open game tabs or recapture anything, and finish
with the verifier result and MP4 paths. If it fails because video evidence is missing or invalid,
continue with the capture workflow below.

Use the `control-chrome` skill and the existing Chrome Default profile. Read that skill completely.
In the first `node_repl` JavaScript call, initialize the browser runtime exactly once from
`__BROWSER_CLIENT_MJS__`. Select the Chrome extension backend with
`agent.browsers.get("extension")`, bind it as `globalThis.chrome`, and emit/read the complete
documentation with the exact direct call `nodeRepl.write(await chrome.documentation())` before
interacting with a page. Reuse this one browser binding. Do not use standalone Playwright, CDP
servers, AppleScript, coordinate shell automation, or the in-app browser.

For each game below, open a fresh Chrome tab at the exact source URL, wait for the embedded game,
and perform the stated real interaction. Capture at least 24 time-ordered screenshots from that
same active tab at roughly 4 fps. Start capture before the first gameplay input and keep capture
running concurrently while clicks, drags, or animation happen. Save frames under
`<evidence-root>/<slug>/frames/frame-000.png` and onward. Do not create a video by looping,
concatenating, or animating a handful of still screenshots.

After each capture, use ffmpeg only for media encoding: encode the ordered raw frames as
`<evidence-root>/<slug>/run-01.mp4` at 4 fps with H.264 and `yuv420p`. Each video must be at least
2 seconds and contain real temporal changes. Keep all raw frames for audit.

Games and verified interaction hints:

1. `loopit-sandbox-stairs-stones-drop-wall-zigzag`
   - URL: `https://share.loopit.me/game/94097d52-c473-4e1a-8159-2ae5ba7bd6ac`
   - Enter the embedded game, click `Stairs`, then make visible drags so the figure changes pose.

2. `loopit-football-street-practice`
   - URL: `https://share.loopit.me/game/49cf9812-e7bf-4479-9d37-c4c1d6f4e395`
   - Click `Practice / Make Level`, wait for practice to load, then draw a real shot path until the
     ball moves and a result or retry state is observable.

3. `loopit-touch-me-as-quick-as-possible`
   - URL: `https://share.loopit.me/game/2c7c7487-9c03-4853-a987-86b4af1fd360`
   - Repeatedly click the embedded game body during capture so the CPS/counter visibly changes.

4. `loopit-oiia-oiia`
   - URL: `https://share.loopit.me/game/a7a67ac0-b867-435b-92d9-5aadad5fd811`
   - Click the embedded `#icon-drum` control during capture and retain the rainbow/card animation.

5. `loopit-the-eye`
   - URL: `https://share.loopit.me/game/7d6ba720-9322-410e-bda2-5840faeade5e`
   - Click the embedded game body to enter the void scene, then perform visible drag/hold input
     while the animated scene is captured.

Use `node:fs/promises` inside the same `node_repl` session to write the `Uint8Array` returned by
`tab.screenshot()`. Use an asynchronous delay between frames and run capture and interaction with
`Promise.all` or an equivalent concurrent structure. Validate each PNG's actual file type.

The evidence root already contains the stable JPG evidence required by the tracked manifest. Do
not overwrite those JPG files. After all videos are encoded, run the repository verifier:

```bash
cd __REPOSITORY_PATH__
node tools/verify-daily-guides.mjs \
  --before-ref e712d46290e5a4de2c48937a65cf64b9c0cb13f9 \
  --after-ref 9c8875f22b27f474793ed211d4180c5509c11f9a \
  --manifest-ref HEAD \
  --date 2026-07-14 \
  --evidence-root __REPAIR_EVIDENCE_DIR__ \
  --expected-count 5
```

If frame diversity fails, recapture only the failing game with more ongoing real interaction.
Never weaken the verifier and never fabricate frames. Close only tabs you created. Finish with a
concise factual summary containing the verifier result and every MP4 path. If Chrome cannot
connect after the skill's single supported recovery retry, stop and report the exact error.
