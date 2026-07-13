import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL("../.github/workflows/daily-five-guides.yml", import.meta.url);
const promptUrl = new URL("../.github/prompts/daily-five-guides.md", import.meta.url);
const preflightPromptUrl = new URL("../.github/prompts/daily-five-guides-preflight.txt", import.meta.url);

test("daily workflow runs five-guide automation on the trusted Mac", async () => {
  const [workflow, prompt, preflightPrompt] = await Promise.all([
    readFile(workflowUrl, "utf8"),
    readFile(promptUrl, "utf8"),
    readFile(preflightPromptUrl, "utf8"),
  ]);

  assert.match(workflow, /cron:\s*["']17 3 \* \* \*["']/);
  assert.match(workflow, /timezone:\s*["']Asia\/Shanghai["']/);
  assert.match(workflow, /runs-on:\s*\[self-hosted, macOS, ARM64, game-guide-base\]/);
  assert.match(workflow, /fetch-depth:\s*2/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /codex[\s\S]+exec/);
  assert.equal(workflow.match(/model_reasoning_effort="xhigh"/g)?.length, 2);
  assert.match(workflow, /verify-daily-guides\.mjs/);
  assert.match(workflow, /build-deploy\.mjs/);
  assert.match(workflow, /wrangler@4\.110\.0 pages deploy \.deploy/);
  assert.match(workflow, /upload-artifact@v7/);
  assert.equal(workflow.match(/if: \$\{\{ env\.RUN_MODE == 'preflight' \}\}/g)?.length ?? 0, 0);
  assert.match(workflow, /grep -Fqx "BROWSER_PREFLIGHT_OK"/);
  assert.match(workflow, /\/Applications\/ChatGPT\.app\/Contents\/MacOS\/ChatGPT/);
  assert.match(workflow, /\/Applications\/Google Chrome\.app\/Contents\/MacOS\/Google Chrome/);
  assert.match(workflow, /nohup "\$CHROME_BIN"/);
  assert.match(workflow, /--new-window/);
  assert.match(workflow, /browser-host-diagnostics\.txt/);
  assert.match(workflow, /check-native-host-manifest\.js/);
  assert.doesNotMatch(workflow, /ubuntu-latest|openai\/codex-action/);

  assert.match(prompt, /new-guides 5/);
  assert.match(prompt, /UCH-41/);
  assert.match(prompt, /DAILY_EVIDENCE_DIR/);
  assert.match(prompt, /data\/daily-runs/);
  assert.match(prompt, /dynamic[\s\S]+video/i);
  assert.match(prompt, /do not[\s\S]+deploy Cloudflare Pages/i);
  assert.match(prompt, /Chrome[\s\S]+Default profile/i);
  assert.match(prompt, /\/Applications\/Google Chrome\.app\/Contents\/MacOS\/Google Chrome/);
  assert.match(prompt, /open a new Chrome window[\s\S]+do not\s+ask/i);

  assert.match(preflightPrompt, /Do not run shell commands/i);
  assert.match(preflightPrompt, /Chrome[\s\S]+Default profile/i);
  assert.match(preflightPrompt, /\/Applications\/Google Chrome\.app\/Contents\/MacOS\/Google Chrome/);
  assert.match(preflightPrompt, /open a new Chrome window[\s\S]+do not\s+ask/i);
  assert.match(preflightPrompt, /BROWSER_PREFLIGHT_OK/);
});
