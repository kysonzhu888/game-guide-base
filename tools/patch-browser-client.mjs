#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { patchBrowserClientRuntime } from "./lib/browser-client-runtime-patch.mjs";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  console.error("Usage: node tools/patch-browser-client.mjs <input> <output>");
  process.exit(2);
}

const source = await readFile(inputPath, "utf8");
const patched = patchBrowserClientRuntime(source);
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, patched);

console.log(JSON.stringify({
  outputPath: path.resolve(outputPath),
  sha256: createHash("sha256").update(patched).digest("hex"),
}));
