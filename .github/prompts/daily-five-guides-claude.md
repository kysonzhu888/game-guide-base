# Game Guide Base daily new-guides 5 run (Claude engine fallback)

Execute one production `new-guides 5` run for Game Guide Base. This is the Claude fallback engine,
used when the Codex quota is unavailable; it must produce the same evidence-backed result and pass
the same deterministic verifier. This is not a coverage refresh. Five existing guides with new
timestamps do not count. Never invent play results, routes, creators, statistics, screenshots, or
outcomes to reach the target.

The trusted workflow provides these environment variables:

- `DAILY_RUN_DATE`: Asia/Shanghai date in `YYYY-MM-DD`.
- `BASELINE_SHA`: immutable `origin/main` commit captured before this run.
- `DAILY_EVIDENCE_DIR`: artifact directory for raw screenshots, frames, and videos.
- `LINEAR_PARENT_ISSUE`: always `UCH-41`.
- `TARGET_GUIDES`: always `5`.
- `GITHUB_RUN_URL`: this workflow run.
- `CDP_PORT` / `CDP_PROFILE`: the debug port and temporary user-data-dir of the pre-launched Chrome.

Use the `$playable-game-guide` workflow and obey the repository/user AGENTS rules. Work only inside
the Actions checkout plus `DAILY_EVIDENCE_DIR` and the dated docs evidence directory.

## 0. Browser runtime (agent-browser + real Chrome)

The workflow step before this one already launched a real Google Chrome (a fresh temporary
`--user-data-dir=$CDP_PROFILE` with `--remote-debugging-port=$CDP_PORT`) and ran
`agent-browser connect $CDP_PORT`, so an `agent-browser` session is already attached. A real Chrome
is mandatory: Loopit games are served from `cdn-cf.loopit.me` behind a Cloudflare challenge that
blocks agent-browser's own bundled Chromium; only a real Chrome clears the "Just a moment..."
challenge. Never fall back to agent-browser's default managed browser for gameplay.

Read the `agent-browser` skill first (`agent-browser skills get core --full`), then drive Chrome
through the `agent-browser` CLI via the Bash tool: `open`, `snapshot`, `screenshot`, `eval`,
`mouse move|down|up`, `wait`, `record start|stop`. If the session drops, recover once in the same
run — the runner's LaunchAgent environment cannot use LaunchServices to open the bundle, so launch
the executable directly:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port="$CDP_PORT" --user-data-dir="$CDP_PROFILE" \
  --no-first-run --no-default-browser-check --new-window about:blank >/dev/null 2>&1 &
sleep 4 && agent-browser connect "$CDP_PORT"
```

Do not ask for permission. Do not open any logged-in profile and do not inspect cookies, passwords,
or profile storage.

## 1. Ticket and baseline first

Before content or code changes:

1. Read `~/.linear/api_token` without printing it. Verify `organization.urlKey == "uchuu"` and team
   key `UCH`. Stop if either differs.
2. Create or reuse one child issue under UCH-41 named
   `DAILY_RUN_DATE | Loopit 每日 5 个新攻略`, assigned to the current viewer, due that day, and move
   it to In Progress. Note in its rolling comment that this run used the Claude fallback engine, and
   include `GITHUB_RUN_URL` and `BASELINE_SHA`.
3. Fetch `origin`, verify `BASELINE_SHA` exists, and record the baseline game count plus all existing
   slug/sourceUrl values from `BASELINE_SHA:data/games.json`.
4. Create or reuse branch `automation/daily-five-guides-DAILY_RUN_DATE`. Do not work on main.

## 2. Discover and really play candidates

Prepare at least 8-10 deduplicated Loopit candidates so blocked candidates can be replaced.
Deduplicate against the baseline, current checkout, remote branches, today's Linear issue, and the
live site. Every accepted source must be a real `https://share.loopit.me/game/...` URL.

For every candidate:

1. `agent-browser open` the public share page and confirm the embedded game itself responds. Wait
   for the game to finish booting before judging it: poll `agent-browser snapshot` /
   `agent-browser eval` until the iframe shows real game UI, not a "Loading..." or Cloudflare
   "Just a moment..." screen. HTTP 200 for the shell is not gameplay evidence.
2. Record source title, Loopit display name, visible engagement, genre, controls, initial state,
   progress signal, success/failure/result state, retry behavior, and visible branches.
3. Reach at least one explicit gameplay outcome or observable state transition. Interact with the
   game canvas using `agent-browser mouse move <x> <y>` then `mouse down` / `mouse up` at the
   iframe's on-screen coordinates (read the iframe rect via `agent-browser eval`). If CDN, identity,
   device, network, or controls block this, move the candidate to `rejectedCandidates` and choose a
   replacement. Do not publish five blocker-only pages.
4. For dynamic or real-time games, capture a continuous screen recording of the real interaction —
   never build an MP4 by concatenating, looping, or animating still images. Start the recording
   before the first real input and keep it running through at least 2-3 seconds of actual animated
   gameplay in the same tab:

   ```bash
   agent-browser record start "$DAILY_EVIDENCE_DIR/<slug>/capture.webm"
   # ... perform real gameplay via agent-browser mouse over >= 3 seconds ...
   agent-browser record stop
   ffmpeg -y -i "$DAILY_EVIDENCE_DIR/<slug>/capture.webm" \
     -vf "fps=12,scale=1200:-2" -pix_fmt yuv420p \
     "$DAILY_EVIDENCE_DIR/<slug>/run-01.mp4"
   ```

   Then self-check the encoded video against the verifier's thresholds before trusting it — the
   verifier samples at 4fps and requires duration >= 2s, >= 12 decoded frames, >= 6 sampled frames,
   >= 6 distinct sampled frames, and a >= 0.35 distinct-frame ratio:

   ```bash
   ffprobe -v error -select_streams v:0 -count_frames \
     -show_entries stream=duration,nb_read_frames -of json "$DAILY_EVIDENCE_DIR/<slug>/run-01.mp4"
   ```

   If the game did not actually animate (too few distinct frames), it means you recorded a static or
   loading screen — re-capture while genuinely playing, or reject the candidate. Dynamic manifest
   entries must include `video` evidence with `captureMethod: "screen-recording"` and the actual
   integer `sourceFrameCount` (the mp4's decoded frame count). For static/turn-based games, retain at
   least two screenshots showing entry and verified outcome instead of a video.
5. Save raw evidence below `DAILY_EVIDENCE_DIR/<slug>/`. Also copy the stable evidence set to
   `$HOME/sekai.app.dir/docs/YYYYMMDD/game-guide-base-daily/<slug>/`. Never capture secrets.

## 3. Add complete guide records

Add exactly five new unique objects to `data/games.json`. Each must include a real sourceUrl,
platform/genre/creator metadata, original summary and quick answer, basics, controls, strategy,
mistakes, FAQ, creator context, community notes, at least two published screenshots with alt and
caption, coverage status/checklist/notes, and `lastUpdated` plus `coverageUpdated` equal to
`DAILY_RUN_DATE`. Keep claims within observed evidence and list unverified deeper branches as
pending.

Validate every published screenshot's real MIME type and place it under
`assets/<slug>/NN-short-step.<ext>`. Run:

1. `node tools/prepare-media.mjs`
2. `node tools/upload-media.mjs --dry-run` with one `--source-prefix=/assets/<slug>/` per new game
3. `node tools/upload-media.mjs` with the same five prefixes
4. `node tools/build.mjs`
5. `npm test`

Confirm each published screenshot has a `data/media-assets.generated.json` mapping, every new R2 URL
returns HTTP 200 with an image content type, generated pages contain the new guides, slug and
sourceUrl sets remain unique, and final game count is baseline +5.

## 4. Write the tracked run manifest

Create `data/daily-runs/DAILY_RUN_DATE.json` with this exact shape:

```json
{
  "schemaVersion": 1,
  "date": "YYYY-MM-DD",
  "mode": "new-guides",
  "targetCount": 5,
  "baseline": { "ref": "FULL_BASELINE_SHA", "gameCount": 63 },
  "final": { "gameCount": 68 },
  "linear": { "parentIssue": "UCH-41", "dailyIssue": "UCH-123" },
  "guides": [
    {
      "slug": "loopit-example",
      "sourceUrl": "https://share.loopit.me/game/example",
      "status": "verified",
      "dynamic": true,
      "outcomes": ["Observed outcome or state transition"],
      "pending": ["Any unverified deeper branch"],
      "evidence": [
        {
          "type": "video",
          "path": "loopit-example/run-01.mp4",
          "captureMethod": "screen-recording",
          "sourceFrameCount": 24
        },
        { "type": "frame", "path": "loopit-example/01-entry.jpg" }
      ]
    }
  ],
  "rejectedCandidates": []
}
```

Evidence paths are relative to `DAILY_EVIDENCE_DIR`. The five `guides` entries must exactly match the
five newly added records. The verifier reads Git objects, so create the scoped local commit first,
then run it against `HEAD` before pushing:

```bash
node tools/verify-daily-guides.mjs \
  --before-ref "$BASELINE_SHA" \
  --after-ref HEAD \
  --date "$DAILY_RUN_DATE" \
  --evidence-root "$DAILY_EVIDENCE_DIR" \
  --expected-count 5
```

## 5. Git, PR, and Linear handoff

Commit only this run's guide data, published screenshots, media manifest, generated pages, and
tracked daily manifest. Run the verifier against that commit. Push the dated branch and open a real
PR to `main`, then verify its URL/repo/base/head and mergeability with `gh`. **Do not merge the PR
and do not delete its branch.** Leave the PR open: the workflow's own "Verify the generated daily
pull request" step reads `origin/<daily-branch>` and asserts exactly one open PR, and the human
review + merge is an intentional quality gate before anything reaches production. Merging here breaks
that verify step (the branch disappears) and bypasses review. Put the actual PR URL, five guide URLs,
source URLs, outcomes, pending cases, and screenshot evidence into the existing Linear rolling
comment, and note that the Claude fallback engine produced this run. Upload screenshots to Linear
when supported, then move the daily child issue to In Review. Never mark it Done.

Do not merge and do not deploy Cloudflare Pages in this phase. After you leave the PR open, the
deterministic workflow verifies it; the user merges it; a later resume run builds the allowlisted
package, deploys Pages, and performs public HTTP checks. If fewer than five verified new guides are
available, do not open a partial-run PR; keep the daily issue In Progress, document blockers and
evidence, and report the shortfall honestly.

On an unrecoverable failure, print one line beginning `CLAUDE_AGENT_FAILED:` with the factual reason
so the workflow's failure reporter can pick it up.
