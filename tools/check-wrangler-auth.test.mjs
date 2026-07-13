import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = new URL("./check-wrangler-auth.mjs", import.meta.url);

async function createFakeNpx(directory, body) {
  const executablePath = join(directory, "fake-npx");
  await writeFile(executablePath, `#!/bin/sh\n${body}\n`, "utf8");
  await chmod(executablePath, 0o755);
  return executablePath;
}

test("wrangler auth check is non-interactive and records output", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "wrangler-auth-success-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const fakeNpx = await createFakeNpx(
    directory,
    'printf "%s|%s|%s\\n" "$CI" "$BROWSER" "$*"',
  );
  const outputPath = join(directory, "wrangler.txt");

  const result = spawnSync(process.execPath, [scriptPath.pathname, outputPath], {
    encoding: "utf8",
    env: { ...process.env, NPX_BIN: fakeNpx },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    await readFile(outputPath, "utf8"),
    "true|none|--yes wrangler@4.110.0 whoami\n",
  );
});

test("wrangler auth check fails quickly instead of waiting for login", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "wrangler-auth-timeout-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const fakeNpx = await createFakeNpx(directory, "while :; do :; done");
  const outputPath = join(directory, "wrangler.txt");

  const startedAt = Date.now();
  const result = spawnSync(process.execPath, [scriptPath.pathname, outputPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      NPX_BIN: fakeNpx,
      WRANGLER_AUTH_TIMEOUT_MS: "50",
    },
    timeout: 2_000,
  });

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /timed out after 50 ms/);
  assert.ok(Date.now() - startedAt < 1_000);
});

test("wrangler auth check accepts complete Pages credentials before killing a hung process", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "wrangler-auth-confirmed-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const fakeNpx = await createFakeNpx(
    directory,
    'printf "You are logged in with an OAuth Token\\npages (write)\\n"; while :; do :; done',
  );
  const outputPath = join(directory, "wrangler.txt");

  const result = spawnSync(process.execPath, [scriptPath.pathname, outputPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      NPX_BIN: fakeNpx,
      WRANGLER_AUTH_TIMEOUT_MS: "5000",
    },
    timeout: 10_000,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /credentials were confirmed before the process timed out/);
});
