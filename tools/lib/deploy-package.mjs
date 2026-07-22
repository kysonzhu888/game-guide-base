import { cp, lstat, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

const ROOT_FILES = [
  "404.html",
  "ads.txt",
  "google1089c0cca1aa4f0a.html",
  "index.html",
  "robots.txt",
  "script.js",
  "sitemap.xml",
  "styles.css",
  "update-history.css",
];

const RUNTIME_DIRECTORIES = [
  "about",
  "access",
  "api",
  "contact",
  "creators",
  "developers",
  "functions",
  "games",
  "genres",
  "platforms",
  "privacy",
];

const FORBIDDEN_SEGMENTS = new Set([
  ".git",
  ".media",
  ".wrangler",
  "data",
  "node_modules",
  "promo",
  "tools",
]);

export async function buildDeployPackage({ root, output }) {
  const sourceRoot = path.resolve(root);
  const outputRoot = path.resolve(output);
  if (outputRoot === sourceRoot || !outputRoot.startsWith(`${sourceRoot}${path.sep}`)) {
    throw new Error("Deployment output must be a child of the project root.");
  }

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });

  for (const file of ROOT_FILES) {
    const source = path.join(sourceRoot, file);
    if (!await exists(source)) {
      if (file === "update-history.css") continue;
      throw new Error(`Missing generated runtime file: ${file}`);
    }
    await cp(source, path.join(outputRoot, file));
  }

  for (const directory of RUNTIME_DIRECTORIES) {
    const source = path.join(sourceRoot, directory);
    if (!await exists(source)) continue;
    await cp(source, path.join(outputRoot, directory), { recursive: true });
  }

  const heroSource = path.join(sourceRoot, "assets", "hero-game-guides-1200w.jpg");
  if (!await exists(heroSource)) throw new Error("Missing hero image for deployment.");
  const heroTarget = path.join(outputRoot, "assets", "hero-game-guides-1200w.jpg");
  await mkdir(path.dirname(heroTarget), { recursive: true });
  await cp(heroSource, heroTarget);

  return auditPackage(outputRoot);
}

async function auditPackage(outputRoot) {
  let files = 0;
  let bytes = 0;

  for (const relativePath of await walk(outputRoot)) {
    const segments = relativePath.split(path.sep);
    const lower = relativePath.toLowerCase();
    if (
      segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment))
      || lower.endsWith(".md")
      || lower.endsWith(".log")
      || lower.endsWith(".zip")
    ) {
      throw new Error(`Forbidden deployment artifact: ${relativePath}`);
    }
    const fileStat = await lstat(path.join(outputRoot, relativePath));
    if (fileStat.isSymbolicLink()) {
      throw new Error(`Deployment package must not contain symlinks: ${relativePath}`);
    }
    files += 1;
    bytes += fileStat.size;
  }

  return { output: outputRoot, files, bytes };
}

async function walk(root, prefix = "") {
  const result = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relativePath = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      result.push(...await walk(root, relativePath));
    } else {
      result.push(relativePath);
    }
  }
  return result;
}

async function exists(filePath) {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
