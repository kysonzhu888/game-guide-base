import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL("../.github/workflows/daily-five-guides.yml", import.meta.url);
const promptUrl = new URL("../.github/prompts/daily-five-guides.md", import.meta.url);
const preflightPromptUrl = new URL("../.github/prompts/daily-five-guides-preflight.txt", import.meta.url);
const uploadMediaUrl = new URL("./upload-media.mjs", import.meta.url);

test("daily workflow runs five-guide automation on the trusted Mac", async () => {
  const [workflow, prompt, preflightPrompt, uploadMedia] = await Promise.all([
    readFile(workflowUrl, "utf8"),
    readFile(promptUrl, "utf8"),
    readFile(preflightPromptUrl, "utf8"),
    readFile(uploadMediaUrl, "utf8"),
  ]);

  assert.match(workflow, /cron:\s*["']17 3 \* \* \*["']/);
  assert.match(workflow, /timezone:\s*["']Asia\/Shanghai["']/);
  assert.match(workflow, /runs-on:\s*\[self-hosted, macOS, ARM64, game-guide-base\]/);
  assert.match(workflow, /fetch-depth:\s*2/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /CODEX_BIN:\s*\/Applications\/ChatGPT\.app\/Contents\/Resources\/codex/);
  assert.match(
    workflow,
    /CODEX_SIGNED_NODE_BIN:\s*\/Applications\/ChatGPT\.app\/Contents\/Resources\/cua_node\/bin\/node/,
  );
  assert.match(workflow, /CODEX_MODEL:[^\n]*gpt-5\.4-mini/);
  assert.match(workflow, /CODEX_QUOTA_TIMEOUT_SECONDS:\s*["']90["']/);
  assert.match(workflow, /CODEX_PREFLIGHT_TIMEOUT_SECONDS:\s*["']180["']/);
  assert.match(workflow, /CODEX_AGENT_TIMEOUT_SECONDS:\s*["']13800["']/);
  assert.match(workflow, /PAGES_DEPLOY_TIMEOUT_SECONDS:\s*["']600["']/);
  assert.match(workflow, /WRANGLER_SEND_METRICS:\s*["']false["']/);
  assert.match(workflow, /BROWSER_CLIENT_MJS:[^\n]*browser-client\.mjs/);
  assert.equal(workflow.match(/"\$CODEX_BIN"/g)?.length, 6);
  assert.equal(workflow.match(/-m "\$CODEX_MODEL"/g)?.length, 3);
  assert.equal(workflow.match(/\/usr\/bin\/perl -e '[^']*alarm \$seconds; exec @ARGV/g)?.length, 1);
  assert.equal(
    workflow.match(/"\$CODEX_SIGNED_NODE_BIN" tools\/run-with-timeout\.mjs/g)?.length,
    2,
  );
  assert.match(
    workflow,
    /"\$CODEX_SIGNED_NODE_BIN" tools\/run-with-timeout\.mjs[\s\S]+"\$CODEX_PREFLIGHT_TIMEOUT_SECONDS"[\s\S]+"\$CODEX_BIN"/,
  );
  assert.match(
    workflow,
    /"\$CODEX_SIGNED_NODE_BIN" tools\/run-with-timeout\.mjs[\s\S]+"\$CODEX_AGENT_TIMEOUT_SECONDS"[\s\S]+"\$CODEX_BIN"/,
  );
  assert.equal(workflow.match(/__BROWSER_CLIENT_MJS__/g)?.length, 2);
  assert.doesNotMatch(workflow, /\n\s+codex\s+-c/);
  assert.equal(workflow.match(/model_reasoning_effort="xhigh"/g)?.length, 3);
  assert.match(workflow, /CODEX_QUOTA_OK/);
  assert.match(workflow, /Codex daily-guide gate failed/);
  assert.match(workflow, /LINEAR_FAILURE_ISSUE:\s*UCH-125/);
  assert.match(workflow, /report-daily-failure\.mjs/);
  assert.match(workflow, /if: \$\{\{ failure\(\) \}\}/);
  assert.match(workflow, /display notification "GameGuideBase daily pipeline failed"/);
  assert.match(workflow, /patch-browser-client\.mjs/);
  assert.match(workflow, /BROWSER_CLIENT_SAFE_MJS/);
  assert.doesNotMatch(workflow, /rm -f "\$BROWSER_CLIENT_MJS"/);
  assert.match(workflow, /CODEX_TRUSTED_BROWSER_CLIENT_SHA256S/);
  assert.equal(
    workflow.match(/NODE_REPL_TRUSTED_BROWSER_CLIENT_SHA256S=/g)?.length,
    2,
  );
  assert.match(workflow, /verify-daily-guides\.mjs/);
  assert.match(workflow, /build-deploy\.mjs/);
  assert.match(workflow, /wrangler@4\.110\.0 pages deploy \.deploy/);
  assert.match(
    workflow,
    /"\$CODEX_SIGNED_NODE_BIN" tools\/run-until-output\.mjs[\s\S]+"\$PAGES_DEPLOY_TIMEOUT_SECONDS"[\s\S]+"Deployment complete!"[\s\S]+wrangler@4\.110\.0 pages deploy/,
  );
  assert.match(workflow, /upload-artifact@v7/);
  assert.equal(workflow.match(/if: \$\{\{ env\.RUN_MODE == 'preflight' \}\}/g)?.length ?? 0, 0);
  assert.match(workflow, /grep -Fqx "BROWSER_PREFLIGHT_OK"/);
  assert.match(workflow, /\/Applications\/ChatGPT\.app\/Contents\/MacOS\/ChatGPT/);
  assert.match(workflow, /\/Applications\/Google Chrome\.app\/Contents\/MacOS\/Google Chrome/);
  assert.match(workflow, /nohup "\$CHROME_BIN"/);
  assert.match(workflow, /--new-window/);
  assert.match(workflow, /browser-host-diagnostics\.txt/);
  assert.match(workflow, /check-native-host-manifest\.js/);
  assert.match(workflow, /check-wrangler-auth\.mjs/);
  assert.doesNotMatch(workflow, /ubuntu-latest|openai\/codex-action/);

  assert.match(prompt, /new-guides 5/);
  assert.match(prompt, /UCH-41/);
  assert.match(prompt, /DAILY_EVIDENCE_DIR/);
  assert.match(prompt, /data\/daily-runs/);
  assert.match(prompt, /dynamic[\s\S]+video/i);
  assert.match(prompt, /continuous temporal capture/i);
  assert.match(prompt, /never[\s\S]+MP4[\s\S]+screenshots/i);
  assert.match(prompt, /tab\.screenshot\(\)/);
  assert.match(prompt, /browser-frame-sequence/);
  assert.match(prompt, /not[\s\S]+hand-picked screenshots[\s\S]+slideshow/i);
  assert.match(prompt, /do not[\s\S]+deploy Cloudflare Pages/i);
  assert.match(prompt, /Chrome[\s\S]+Default profile/i);
  assert.match(prompt, /setupBrowserRuntime/);
  assert.match(prompt, /__BROWSER_CLIENT_MJS__/);
  assert.match(prompt, /\/Applications\/Google Chrome\.app\/Contents\/MacOS\/Google Chrome/);
  assert.match(prompt, /open a new Chrome window[\s\S]+do not\s+ask/i);

  assert.match(preflightPrompt, /Do not run shell commands/i);
  assert.match(preflightPrompt, /Chrome[\s\S]+Default profile/i);
  assert.match(preflightPrompt, /setupBrowserRuntime/);
  assert.match(preflightPrompt, /__BROWSER_CLIENT_MJS__/);
  assert.match(preflightPrompt, /\/Applications\/Google Chrome\.app\/Contents\/MacOS\/Google Chrome/);
  assert.match(preflightPrompt, /open a new Chrome window[\s\S]+do not\s+ask/i);
  assert.match(preflightPrompt, /BROWSER_PREFLIGHT_OK/);

  assert.match(uploadMedia, /WRANGLER_SEND_METRICS:\s*"false"/);
  assert.match(uploadMedia, /run-until-output\.mjs/);
  assert.match(uploadMedia, /Upload complete\./);
  assert.match(uploadMedia, /waitForPublishedAsset/);
  assert.match(uploadMedia, /R2_UPLOAD_TIMEOUT_SECONDS/);
  assert.match(uploadMedia, /R2_UPLOAD_ATTEMPTS/);
  assert.match(uploadMedia, /R2_PUBLIC_VERIFY_TIMEOUT_SECONDS/);
  assert.match(uploadMedia, /"--yes",\s*\n\s*"wrangler@4\.110\.0"/);
});
