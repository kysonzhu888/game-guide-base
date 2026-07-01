import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const args = new Set(process.argv.slice(2));

const dryRun = args.has("--dry-run");
const maxWidth = numberArg("--max-width", 1200);
const quality = numberArg("--quality", 82);

const games = readJson("data/games.json");
const outputRoot = path.join(root, ".media");
const manifestPath = path.join(root, "data", "media-assets.generated.json");

const manifest = {};
const jobs = collectScreenshotJobs();

if (!dryRun) {
  fs.rmSync(outputRoot, { recursive: true, force: true });
}

for (const job of jobs) {
  manifest[job.src] = {
    r2Key: job.r2Key,
    localOutput: path.relative(root, job.outputPath),
    width: maxWidth,
    format: "jpeg",
    quality,
  };

  if (dryRun) continue;

  fs.mkdirSync(path.dirname(job.outputPath), { recursive: true });
  convertWithSips(job.inputPath, job.outputPath);
}

if (!dryRun) {
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

console.log(`${dryRun ? "Planned" : "Prepared"} ${jobs.length} media assets.`);
console.log(`Output: ${path.relative(root, outputRoot)}`);
console.log(`Manifest: ${path.relative(root, manifestPath)}`);

function collectScreenshotJobs() {
  const result = [];
  for (const game of games) {
    const platformSlug = game.sourcePlatformSlug || slugify(game.sourcePlatform || "other");
    const screenshots = Array.isArray(game.screenshots) ? game.screenshots : [];
    screenshots.forEach((shot, index) => {
      if (!shot.src || /^https?:\/\//.test(shot.src)) return;

      const sourcePath = shot.src.replace(/^\//, "");
      const inputPath = path.join(root, sourcePath);
      if (!fs.existsSync(inputPath)) {
        throw new Error(`Missing screenshot source: ${sourcePath}`);
      }

      const stepName = path.basename(sourcePath, path.extname(sourcePath));
      const safeStepName = normalizeStepName(stepName, index + 1);
      const r2Key = [
        "games",
        platformSlug,
        game.slug,
        "screenshots",
        `${safeStepName}-1200w.jpg`,
      ].join("/");

      result.push({
        src: shot.src,
        inputPath,
        outputPath: path.join(outputRoot, r2Key),
        r2Key,
      });
    });
  }
  return result;
}

function convertWithSips(inputPath, outputPath) {
  const result = spawnSync("sips", [
    "-s",
    "format",
    "jpeg",
    "-s",
    "formatOptions",
    String(quality),
    "-Z",
    String(maxWidth),
    inputPath,
    "--out",
    outputPath,
  ], { encoding: "utf8" });

  if (result.status !== 0) {
    throw new Error(`sips failed for ${path.relative(root, inputPath)}\n${result.stderr || result.stdout}`);
  }
}

function normalizeStepName(value, index) {
  const withIndex = /^\d{2}-/.test(value) ? value : `${String(index).padStart(2, "0")}-${value}`;
  return slugify(withIndex);
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function numberArg(name, fallback) {
  const raw = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (!raw) return fallback;
  const value = Number(raw.split("=")[1]);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }
  return value;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}
