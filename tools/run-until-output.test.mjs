import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = new URL("./run-until-output.mjs", import.meta.url);

test("returns success and terminates the process group after the success marker", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "run-until-output-"));
  const grandchildPidPath = path.join(directory, "grandchild.pid");
  const childProgram = [
    'const { spawn } = require("node:child_process");',
    'const { writeFileSync } = require("node:fs");',
    'const grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });',
    `writeFileSync(${JSON.stringify(grandchildPidPath)}, String(grandchild.pid));`,
    'console.log("UPLOAD_COMPLETE");',
    'setInterval(() => {}, 1000);',
  ].join("\n");

  try {
    const startedAt = Date.now();
    const result = spawnSync(process.execPath, [
      scriptPath.pathname,
      "5",
      "UPLOAD_COMPLETE",
      process.execPath,
      "-e",
      childProgram,
    ], { encoding: "utf8", timeout: 5_000 });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /UPLOAD_COMPLETE/);
    assert.ok(Date.now() - startedAt < 3_000, "marker completion should not wait for the hard timeout");

    const grandchildPid = Number(readFileSync(grandchildPidPath, "utf8"));
    await waitForProcessExit(grandchildPid);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("preserves a child failure before the success marker", () => {
  const result = spawnSync(process.execPath, [
    scriptPath.pathname,
    "5",
    "NEVER_PRINTED",
    process.execPath,
    "-e",
    "process.exit(7)",
  ], { encoding: "utf8", timeout: 5_000 });

  assert.equal(result.status, 7, result.stderr);
});

test("returns the timeout-compatible status and kills a command without the marker", () => {
  const result = spawnSync(process.execPath, [
    scriptPath.pathname,
    "0.1",
    "NEVER_PRINTED",
    process.execPath,
    "-e",
    "setInterval(() => {}, 1000)",
  ], { encoding: "utf8", timeout: 5_000 });

  assert.equal(result.status, 142, result.stderr);
  assert.match(result.stderr, /timed out after 0\.1 seconds/i);
});

test("rejects invalid arguments before spawning a command", () => {
  const result = spawnSync(process.execPath, [scriptPath.pathname, "0", "DONE"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 64);
  assert.match(result.stderr, /Usage:/);
});

async function waitForProcessExit(pid) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error.code === "ESRCH") return;
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(`process ${pid} survived the wrapper`);
}
