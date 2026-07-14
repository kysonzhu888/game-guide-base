import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

import { patchBrowserClientRuntime } from "./lib/browser-client-runtime-patch.mjs";

const source = `
const processShim = { env: {} };
globalThis.process = processShim;
globalThis.global = globalThis.global ?? globalThis;
globalThis.global.process = processShim;
globalThis.loaded = true;
`;

test("patches the bundled process shim without hiding other runtime failures", () => {
  const patched = patchBrowserClientRuntime(source);
  const sandbox = {};
  Object.defineProperty(sandbox, "process", {
    configurable: false,
    value: { env: { PRESERVE_ME: "yes" } },
    writable: false,
  });

  vm.runInNewContext(patched, sandbox);

  assert.equal(sandbox.process.env.PRESERVE_ME, "yes");
  assert.equal(sandbox.loaded, true);
  assert.match(patched, /try \{ globalThis\.process = processShim; \} catch \{\}/);
  assert.match(patched, /try \{ globalThis\.global\.process = processShim; \} catch \{\}/);
});

test("fails closed when the expected bundled assignments drift", () => {
  assert.throws(
    () => patchBrowserClientRuntime("export const setupBrowserRuntime = () => {};"),
    /browser-client process shim markers changed/,
  );
});

test("accepts an upstream bundle that already removed the conflicting assignments", () => {
  const upstreamFixed = `
const processShim = { env: {} };
export const setupBrowserRuntime = () => processShim;
`;

  assert.equal(patchBrowserClientRuntime(upstreamFixed), upstreamFixed);
});
