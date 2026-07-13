#!/usr/bin/env node

import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const DEFAULT_TIMEOUT_MS = 90_000;
const WRANGLER_PACKAGE = "wrangler@4.110.0";

const [outputPath] = process.argv.slice(2);

if (!outputPath) {
  console.error("Usage: node tools/check-wrangler-auth.mjs <output-path>");
  process.exit(2);
}

const timeoutMs = Number.parseInt(
  process.env.WRANGLER_AUTH_TIMEOUT_MS ?? String(DEFAULT_TIMEOUT_MS),
  10,
);

if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
  console.error("WRANGLER_AUTH_TIMEOUT_MS must be a positive integer.");
  process.exit(2);
}

const result = await runWranglerCheck(
  process.env.NPX_BIN ?? "npx",
  {
    ...process.env,
    BROWSER: "none",
    CI: "true",
  },
  timeoutMs,
);
writeFileSync(outputPath, result.output, "utf8");

if (result.kind === "success") process.exit(0);

if (result.kind === "credentials") {
  console.warn(
    "Wrangler Pages credentials were confirmed before the process timed out; the lingering process was terminated.",
  );
  process.exit(0);
}

const capturedOutput = result.output.trim();
if (capturedOutput) console.error(capturedOutput);

if (result.kind === "timeout") {
  console.error(
    `Wrangler authentication check timed out after ${timeoutMs} ms; interactive login is not allowed in the scheduled workflow.`,
  );
} else if (result.kind === "error") {
  console.error(`Wrangler authentication check failed: ${result.detail.message}`);
} else {
  console.error(`Wrangler authentication check exited with status ${result.detail}.`);
}

process.exit(1);

function runWranglerCheck(executable, environment, maximumDurationMs) {
  return new Promise((resolve) => {
    const child = spawn(executable, ["--yes", WRANGLER_PACKAGE, "whoami"], {
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let settled = false;
    let timer;

    const capture = (chunk) => {
      output += chunk.toString();
      if (hasRequiredCredentials(output)) finish("credentials");
    };
    const finish = (kind, detail) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout?.off("data", capture);
      child.stderr?.off("data", capture);
      if (child.exitCode === null && (kind === "credentials" || kind === "timeout")) {
        child.kill("SIGKILL");
      }
      resolve({ kind, detail, output });
    };

    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    child.once("error", (error) => finish("error", error));
    child.once("close", (status) => finish(status === 0 ? "success" : "exit", status));
    timer = setTimeout(() => finish("timeout"), maximumDurationMs);
  });
}

function hasRequiredCredentials(output) {
  return (
    output.includes("You are logged in with an OAuth Token")
    && /\bpages\s+\(write\)/.test(output)
  );
}
