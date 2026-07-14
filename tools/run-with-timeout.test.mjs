import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const runnerUrl = new URL("./run-with-timeout.mjs", import.meta.url);

function runWithTimeout(timeoutSeconds, childArguments, options = {}) {
  return spawnSync(
    process.execPath,
    [runnerUrl.pathname, String(timeoutSeconds), process.execPath, ...childArguments],
    {
      encoding: "utf8",
      timeout: 5_000,
      ...options,
    },
  );
}

test("passes stdin and the child exit status through", () => {
  const result = runWithTimeout(
    2,
    [
      "-e",
      "process.stdin.setEncoding('utf8'); let text = ''; process.stdin.on('data', chunk => text += chunk); process.stdin.on('end', () => { process.stdout.write(text.toUpperCase()); process.exit(7); });",
    ],
    { input: "browser preflight\n" },
  );

  assert.equal(result.status, 7);
  assert.equal(result.stdout, "BROWSER PREFLIGHT\n");
  assert.equal(result.stderr, "");
});

test("returns the existing timeout-compatible status after terminating the child", () => {
  const result = runWithTimeout(0.05, ["-e", "setInterval(() => {}, 1_000);"]);

  assert.equal(result.status, 142);
  assert.match(result.stderr, /timed out after 0\.05 seconds/i);
});

test("rejects an invalid timeout before spawning a child", () => {
  const result = runWithTimeout("invalid", ["-e", "process.exit(0);"]);

  assert.equal(result.status, 64);
  assert.match(result.stderr, /usage:/i);
});
