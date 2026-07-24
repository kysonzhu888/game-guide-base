import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL("../.github/workflows/daily-five-guides.yml", import.meta.url);
const deploymentWorkflowUrl = new URL(
  "../.github/workflows/deploy-production.yml",
  import.meta.url,
);
const promptUrl = new URL("../.github/prompts/daily-five-guides.md", import.meta.url);
const preflightPromptUrl = new URL("../.github/prompts/daily-five-guides-preflight.txt", import.meta.url);
const repairPromptUrl = new URL(
  "../.github/prompts/repair-2026-07-14-evidence.md",
  import.meta.url,
);
const uploadMediaUrl = new URL("./upload-media.mjs", import.meta.url);
const verifierUrl = new URL("./verify-daily-guides.mjs", import.meta.url);

test("daily workflow runs five-guide automation on the trusted Mac", async () => {
  const [workflow, prompt, preflightPrompt, repairPrompt, uploadMedia, verifier] = await Promise.all([
    readFile(workflowUrl, "utf8"),
    readFile(promptUrl, "utf8"),
    readFile(preflightPromptUrl, "utf8"),
    readFile(repairPromptUrl, "utf8"),
    readFile(uploadMediaUrl, "utf8"),
    readFile(verifierUrl, "utf8"),
  ]);

  assert.match(workflow, /cron:\s*["']17 3 \* \* \*["']/);
  assert.match(workflow, /timezone:\s*["']Asia\/Shanghai["']/);
  assert.match(workflow, /runs-on:\s*\[self-hosted, macOS, ARM64, game-guide-base\]/);
  assert.match(workflow, /fetch-depth:\s*2/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s+pull_request:/);
  assert.match(workflow, /options:\s*\n\s+- preflight\s*\n\s+- full\s*\n\s+- resume/);
  assert.match(workflow, /repair-2026-07-14/);
  assert.match(workflow, /id:\s*run_context/);
  assert.doesNotMatch(workflow, /github\.event_name == 'pull_request'/);
  assert.match(
    workflow,
    /effective_mode="\$RUN_MODE"[\s\S]+test "\$effective_mode" = "full"[\s\S]+test -s "data\/daily-runs\/\$run_date\.json"[\s\S]+effective_mode="resume"/,
  );
  assert.match(workflow, /echo "mode=\$effective_mode" >> "\$GITHUB_OUTPUT"/);
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
  assert.match(workflow, /PRODUCTION_VERIFY_RETRIES:\s*["']18["']/);
  assert.match(workflow, /PRODUCTION_VERIFY_RETRY_DELAY_SECONDS:\s*["']5["']/);
  assert.match(workflow, /PRODUCTION_VERIFY_RETRY_MAX_SECONDS:\s*["']120["']/);
  assert.match(workflow, /WRANGLER_SEND_METRICS:\s*["']false["']/);
  assert.match(workflow, /BROWSER_CLIENT_MJS:[^\n]*browser-client\.mjs/);

  // Engine router: Codex-first with a Claude fallback.
  assert.match(workflow, /engine:\s*\n\s+description:[^\n]*auto[\s\S]+options:\s*\n\s+- auto\s*\n\s+- codex\s*\n\s+- claude/);
  assert.match(workflow, /RUN_ENGINE:\s*\$\{\{ github\.event_name == 'schedule' && 'auto' \|\| inputs\.engine \}\}/);
  assert.match(workflow, /CLAUDE_BIN:\s*claude/);
  assert.match(workflow, /CLAUDE_MODEL:[^\n]*sonnet/);
  assert.match(workflow, /CLAUDE_AGENT_TIMEOUT_SECONDS:\s*["']13800["']/);
  assert.match(workflow, /CDP_PORT:\s*["']9333["']/);
  assert.match(workflow, /Load the Claude subscription token\s*\n\s+if: \$\{\{ env\.RUN_ENGINE != 'codex' \}\}/);
  assert.match(workflow, /CLAUDE_CODE_OAUTH_TOKEN=\$token" >> "\$GITHUB_ENV"/);
  assert.match(workflow, /::add-mask::\$token/);
  assert.match(workflow, /Select the daily engine[\s\S]+CODEX_QUOTA_OK[\s\S]+CLAUDE_QUOTA_OK/);
  assert.match(workflow, /CLAUDE_QUOTA_FAILED/);
  assert.match(workflow, /echo "ENGINE=\$engine" >> "\$GITHUB_ENV"/);
  assert.match(workflow, /Start the local Chrome for the Claude engine\s*\n\s+if: \$\{\{ env\.ENGINE == 'claude' \}\}/);
  assert.match(workflow, /agent-browser connect "\$CDP_PORT"/);
  assert.match(workflow, /Gate the Claude browser runtime\s*\n\s+if: \$\{\{ env\.ENGINE == 'claude' \}\}/);
  assert.match(workflow, /Gate the local Codex and Chrome runtime\s*\n\s+if: \$\{\{ env\.ENGINE == 'codex' \}\}/);
  assert.equal(workflow.match(/--dangerously-skip-permissions/g)?.length, 2);
  assert.match(workflow, /Stop the Claude engine Chrome/);
  assert.equal(workflow.match(/"\$CODEX_BIN"/g)?.length, 7);
  assert.equal(workflow.match(/-m "\$CODEX_MODEL"/g)?.length, 4);
  assert.equal(workflow.match(/\/usr\/bin\/perl -e '[^']*alarm \$seconds; exec @ARGV/g)?.length, 1);
  assert.equal(
    workflow.match(/"\$CODEX_SIGNED_NODE_BIN" tools\/run-with-timeout\.mjs/g)?.length,
    3,
  );
  assert.match(
    workflow,
    /"\$CODEX_SIGNED_NODE_BIN" tools\/run-with-timeout\.mjs[\s\S]+"\$CODEX_PREFLIGHT_TIMEOUT_SECONDS"[\s\S]+"\$CODEX_BIN"/,
  );
  assert.match(
    workflow,
    /"\$CODEX_SIGNED_NODE_BIN" tools\/run-with-timeout\.mjs[\s\S]+"\$CODEX_AGENT_TIMEOUT_SECONDS"[\s\S]+"\$CODEX_BIN"/,
  );
  assert.equal(workflow.match(/__BROWSER_CLIENT_MJS__/g)?.length, 3);
  assert.doesNotMatch(workflow, /\n\s+codex\s+-c/);
  assert.equal(workflow.match(/model_reasoning_effort="high"/g)?.length, 3);
  assert.equal(workflow.match(/model_reasoning_effort="low"/g)?.length, 1);
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
    3,
  );
  assert.match(workflow, /REPAIR_BEFORE_REF:\s*e712d46290e5a4de2c48937a65cf64b9c0cb13f9/);
  assert.match(workflow, /REPAIR_AFTER_REF:\s*9c8875f22b27f474793ed211d4180c5509c11f9a/);
  assert.match(workflow, /cp -R "\$stable_evidence_dir\/\." "\$repair_evidence_dir\/"/);
  assert.match(workflow, /env\.RUN_MODE == 'repair-2026-07-14'/);
  assert.match(workflow, /repair-verification\.json/);
  assert.match(workflow, /REPAIR_EVIDENCE_DIR/);
  assert.match(workflow, /LINEAR_FAILURE_ISSUE=UCH-133/);
  assert.match(workflow, /verify-daily-guides\.mjs/);
  assert.equal(workflow.match(/--manifest-ref "\$GITHUB_SHA"/g)?.length, 2);
  assert.match(workflow, /Load the verified daily run for resume/);
  assert.match(workflow, /data\/daily-runs\/\$DAILY_RUN_DATE\.json/);
  assert.match(workflow, /\.newGuides \| length[\s\S]+\$TARGET_GUIDES/);
  assert.match(workflow, /Build and deploy the verified main branch\s*\n\s+if: \$\{\{ steps\.run_context\.outputs\.mode == 'resume' \}\}/);
  assert.match(workflow, /build-deploy\.mjs/);
  assert.match(workflow, /wrangler@4\.110\.0 pages deploy \.deploy/);
  assert.match(
    workflow,
    /"\$CODEX_SIGNED_NODE_BIN" tools\/run-until-output\.mjs[\s\S]+"\$PAGES_DEPLOY_TIMEOUT_SECONDS"[\s\S]+"Deployment complete!"[\s\S]+wrangler@4\.110\.0 pages deploy/,
  );
  assert.match(
    workflow,
    /curl[\s\S]+--retry "\$PRODUCTION_VERIFY_RETRIES"[\s\S]+--retry-delay "\$PRODUCTION_VERIFY_RETRY_DELAY_SECONDS"[\s\S]+--retry-max-time "\$PRODUCTION_VERIFY_RETRY_MAX_SECONDS"[\s\S]+--retry-all-errors/,
  );
  assert.match(workflow, /upload-artifact@v7/);
  assert.equal(
    workflow.match(/if: \$\{\{ steps\.run_context\.outputs\.mode == 'resume' \}\}/g)?.length,
    3,
  );
  assert.equal(
    workflow.match(/if: \$\{\{ steps\.run_context\.outputs\.mode == 'full' \}\}/g)?.length,
    1,
  );
  assert.match(
    workflow,
    /Run the evidence-backed daily Codex agent\s*\n\s+if: \$\{\{ steps\.run_context\.outputs\.mode == 'full' && env\.ENGINE == 'codex' \}\}/,
  );
  assert.match(
    workflow,
    /Run the evidence-backed daily Claude agent\s*\n\s+if: \$\{\{ steps\.run_context\.outputs\.mode == 'full' && env\.ENGINE == 'claude' \}\}/,
  );
  assert.match(
    workflow,
    /Verify the generated daily pull request[\s\S]+--after-ref "origin\/\$daily_branch"[\s\S]+gh pr list[\s\S]+--state open/,
  );
  assert.doesNotMatch(workflow, /if: \$\{\{ env\.RUN_MODE == '(?:full|resume)'/);
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

  assert.match(repairPrompt, /Repair only the continuous gameplay evidence/i);
  assert.match(repairPrompt, /__BROWSER_CLIENT_MJS__/);
  assert.match(repairPrompt, /__REPAIR_EVIDENCE_DIR__/);
  assert.match(repairPrompt, /at least 24 time-ordered screenshots/i);
  assert.match(repairPrompt, /Do not modify repository files/i);
  assert.match(repairPrompt, /verify-daily-guides\.mjs/);
  assert.match(repairPrompt, /--manifest-ref HEAD/);
  assert.match(repairPrompt, /run the verifier[\s\S]+before initializing Chrome/i);

  assert.match(verifier, /argumentValue\("--manifest-ref"\) \|\| afterRef/);
  assert.match(verifier, /readJsonAtRef\(manifestSha, manifestPath\)/);

  assert.match(uploadMedia, /WRANGLER_SEND_METRICS:\s*"false"/);
  assert.match(uploadMedia, /run-until-output\.mjs/);
  assert.match(uploadMedia, /Upload complete\./);
  assert.match(uploadMedia, /waitForPublishedAsset/);
  assert.match(uploadMedia, /R2_UPLOAD_TIMEOUT_SECONDS/);
  assert.match(uploadMedia, /R2_UPLOAD_ATTEMPTS/);
  assert.match(uploadMedia, /R2_PUBLIC_VERIFY_TIMEOUT_SECONDS/);
  assert.match(uploadMedia, /"--yes",\s*\n\s*"wrangler@4\.110\.0"/);
});

test("production workflow deploys every main update and verifies changed guides", async () => {
  const workflow = await readFile(deploymentWorkflowUrl, "utf8");

  assert.match(workflow, /push:\s*\n\s+branches:\s*\[main\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.match(workflow, /permissions:\s*\n\s+contents:\s*read/);
  assert.match(workflow, /group:\s*game-guide-base-production/);
  assert.match(workflow, /runs-on:\s*\[self-hosted, macOS, ARM64, game-guide-base\]/);
  assert.match(workflow, /ref:\s*\$\{\{ github\.sha \}\}[\s\S]+fetch-depth:\s*0/);
  assert.match(workflow, /PREVIOUS_SHA:\s*\$\{\{ github\.event\.before \}\}/);
  assert.match(workflow, /git diff --diff-filter=AMR[\s\S]+games\//);
  assert.match(workflow, /check-wrangler-auth\.mjs/);
  assert.match(workflow, /npm test[\s\S]+npm run build[\s\S]+npm run package:deploy/);
  assert.match(
    workflow,
    /run-until-output\.mjs[\s\S]+wrangler@4\.110\.0 pages deploy \.deploy/,
  );
  assert.match(workflow, /--commit-hash "\$GITHUB_SHA"/);
  assert.match(workflow, /--commit-dirty=false/);
  assert.match(workflow, /https:\/\/gameguidebase\.com\/robots\.txt/);
  assert.match(workflow, /https:\/\/gameguidebase\.com\/sitemap\.xml/);
  assert.match(workflow, /https:\/\/gameguidebase\.com\/games\/\$slug\//);
  assert.doesNotMatch(workflow, /CODEX_BIN|BROWSER_CLIENT|openai\/codex-action/);
});
