#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { closeSync, openSync, readFileSync } from "node:fs";

const DEFAULT_TIMEOUT_MS = 60_000;
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

const outputFile = openSync(outputPath, "w");
const result = spawnSync(
  process.env.NPX_BIN ?? "npx",
  ["--yes", WRANGLER_PACKAGE, "whoami"],
  {
    env: {
      ...process.env,
      BROWSER: "none",
      CI: "true",
    },
    killSignal: "SIGKILL",
    stdio: ["ignore", outputFile, outputFile],
    timeout: timeoutMs,
  },
);
closeSync(outputFile);

if (result.status === 0 && !result.error) {
  process.exit(0);
}

const capturedOutput = readFileSync(outputPath, "utf8").trim();
if (capturedOutput) {
  console.error(capturedOutput);
}

if (result.error?.code === "ETIMEDOUT") {
  console.error(
    `Wrangler authentication check timed out after ${timeoutMs} ms; interactive login is not allowed in the scheduled workflow.`,
  );
} else if (result.error) {
  console.error(`Wrangler authentication check failed: ${result.error.message}`);
} else {
  console.error(`Wrangler authentication check exited with status ${result.status}.`);
}

process.exit(1);
