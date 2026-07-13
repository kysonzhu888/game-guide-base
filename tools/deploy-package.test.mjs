import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildDeployPackage } from "./lib/deploy-package.mjs";

test("deployment package keeps runtime files and excludes source artifacts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "game-guide-deploy-"));
  const output = path.join(root, ".deploy");

  await Promise.all([
    write(root, "index.html", "home"),
    write(root, "404.html", "not found"),
    write(root, "script.js", "console.log('site')"),
    write(root, "styles.css", "body{}"),
    write(root, "sitemap.xml", "<urlset/>") ,
    write(root, "robots.txt", "User-agent: *"),
    write(root, "ads.txt", "publisher"),
    write(root, "update-history.css", ".history{}"),
    write(root, "games/example/index.html", "guide"),
    write(root, "functions/api/comments.js", "export {}"),
    write(root, "assets/hero-game-guides.png", "hero"),
    write(root, "assets/example/raw.png", "raw screenshot"),
    write(root, "data/games.json", "[]"),
    write(root, "tools/build.mjs", "source"),
    write(root, "notes.md", "private notes"),
  ]);

  const summary = await buildDeployPackage({ root, output });

  assert.equal(await textAt(output, "index.html"), "home");
  assert.equal(await textAt(output, "games/example/index.html"), "guide");
  assert.equal(await textAt(output, "functions/api/comments.js"), "export {}");
  assert.equal(await textAt(output, "assets/hero-game-guides.png"), "hero");
  await assert.rejects(() => readFile(path.join(output, "data/games.json")), /ENOENT/);
  await assert.rejects(() => readFile(path.join(output, "assets/example/raw.png")), /ENOENT/);
  await assert.rejects(() => readFile(path.join(output, "notes.md")), /ENOENT/);
  assert.ok(summary.files >= 11);
  assert.ok(summary.bytes > 0);
});

async function write(root, relativePath, value) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, value);
}

async function textAt(root, relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}
