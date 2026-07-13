import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL("../.github/workflows/daily-five-guides.yml", import.meta.url);
const promptUrl = new URL("../.github/prompts/daily-five-guides.md", import.meta.url);

test("daily workflow runs five-guide automation on the trusted Mac", async () => {
  const [workflow, prompt] = await Promise.all([
    readFile(workflowUrl, "utf8"),
    readFile(promptUrl, "utf8"),
  ]);

  assert.match(workflow, /cron:\s*["']17 3 \* \* \*["']/);
  assert.match(workflow, /timezone:\s*["']Asia\/Shanghai["']/);
  assert.match(workflow, /runs-on:\s*\[self-hosted, macOS, ARM64, game-guide-base\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /codex[\s\S]+exec/);
  assert.match(workflow, /verify-daily-guides\.mjs/);
  assert.match(workflow, /build-deploy\.mjs/);
  assert.match(workflow, /wrangler@4\.110\.0 pages deploy \.deploy/);
  assert.match(workflow, /upload-artifact@v7/);
  assert.doesNotMatch(workflow, /ubuntu-latest|openai\/codex-action/);

  assert.match(prompt, /new-guides 5/);
  assert.match(prompt, /UCH-41/);
  assert.match(prompt, /DAILY_EVIDENCE_DIR/);
  assert.match(prompt, /data\/daily-runs/);
  assert.match(prompt, /dynamic[\s\S]+video/i);
  assert.match(prompt, /do not[\s\S]+deploy Cloudflare Pages/i);
});
