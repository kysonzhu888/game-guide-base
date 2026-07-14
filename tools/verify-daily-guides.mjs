import { execFileSync } from "node:child_process";
import { open, stat } from "node:fs/promises";
import path from "node:path";

import { validateDailyRun } from "./lib/daily-guide-verifier.mjs";

const beforeRef = requiredArgument("--before-ref");
const afterRef = argumentValue("--after-ref") || "origin/main";
const manifestRef = argumentValue("--manifest-ref") || afterRef;
const runDate = argumentValue("--date") || process.env.DAILY_RUN_DATE;
const evidenceRoot = path.resolve(requiredArgument("--evidence-root"));
const expectedCount = Number(argumentValue("--expected-count") || 5);

if (!/^\d{4}-\d{2}-\d{2}$/.test(runDate || "")) {
  throw new Error("--date or DAILY_RUN_DATE must be YYYY-MM-DD.");
}
if (!Number.isInteger(expectedCount) || expectedCount < 1) {
  throw new Error("--expected-count must be a positive integer.");
}

const beforeSha = resolveRef(beforeRef);
const afterSha = resolveRef(afterRef);
const manifestSha = resolveRef(manifestRef);
const manifestPath = `data/daily-runs/${runDate}.json`;

const beforeGames = readJsonAtRef(beforeSha, "data/games.json");
const afterGames = readJsonAtRef(afterSha, "data/games.json");
const mediaManifest = readJsonAtRef(afterSha, "data/media-assets.generated.json");
const manifest = readJsonAtRef(manifestSha, manifestPath);
const trackedPaths = new Set(runGit(["ls-tree", "-r", "--name-only", afterSha])
  .split("\n")
  .filter(Boolean));
const evidenceFiles = await inspectEvidenceFiles(manifest, evidenceRoot);

const result = validateDailyRun({
  beforeGames,
  afterGames,
  manifest,
  expectedCount,
  expectedDate: runDate,
  expectedBaselineRef: beforeSha,
  mediaManifest,
  trackedPaths,
  evidenceFiles,
});

console.log(JSON.stringify({
  verified: true,
  date: runDate,
  beforeRef: beforeSha,
  afterRef: afterSha,
  manifestRef: manifestSha,
  ...result,
}, null, 2));

async function inspectEvidenceFiles(manifestValue, root) {
  const result = new Map();
  const paths = new Set((manifestValue.guides || [])
    .flatMap((guide) => guide.evidence || [])
    .map((evidence) => evidence.path));

  for (const relativePath of paths) {
    const absolutePath = path.resolve(root, relativePath);
    if (absolutePath !== root && !absolutePath.startsWith(`${root}${path.sep}`)) {
      throw new Error(`Evidence path escapes the root: ${relativePath}`);
    }
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) throw new Error(`Evidence is not a file: ${relativePath}`);
    const kind = await detectMediaKind(absolutePath);
    result.set(relativePath, {
      kind,
      size: fileStat.size,
      ...(kind === "video" ? inspectVideoMetrics(absolutePath, relativePath) : {}),
    });
  }
  return result;
}

function inspectVideoMetrics(filePath, relativePath) {
  try {
    const probe = JSON.parse(execFileSync("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-count_frames",
      "-show_entries", "stream=duration,nb_frames,nb_read_frames:format=duration",
      "-of", "json",
      filePath,
    ], commandOptions()));
    const stream = probe.streams?.[0] || {};
    const durationSeconds = Number(stream.duration || probe.format?.duration);
    const frameCount = Number(stream.nb_read_frames || stream.nb_frames);
    const frameHashes = execFileSync("ffmpeg", [
      "-v", "error",
      "-i", filePath,
      "-t", "15",
      "-vf", "fps=4,scale=96:-2:flags=area",
      "-f", "framemd5",
      "-",
    ], commandOptions())
      .split("\n")
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.split(",").at(-1).trim());

    return {
      durationSeconds,
      frameCount,
      sampledFrameCount: frameHashes.length,
      uniqueFrameCount: new Set(frameHashes).size,
    };
  } catch (error) {
    throw new Error(`Unable to inspect video evidence ${relativePath}: ${error.message}`);
  }
}

function commandOptions() {
  return {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  };
}

async function detectMediaKind(filePath) {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(16);
    await handle.read(buffer, 0, buffer.length, 0);
    if (
      (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
      || buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      || (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP")
    ) {
      return "image";
    }
    if (
      buffer.toString("ascii", 4, 8) === "ftyp"
      || buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
    ) {
      return "video";
    }
    return "unknown";
  } finally {
    await handle.close();
  }
}

function readJsonAtRef(ref, file) {
  try {
    return JSON.parse(runGit(["show", `${ref}:${file}`]));
  } catch (error) {
    throw new Error(`Unable to read ${file} at ${ref}: ${error.message}`);
  }
}

function resolveRef(ref) {
  return runGit(["rev-parse", "--verify", `${ref}^{commit}`]).trim();
}

function runGit(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function requiredArgument(name) {
  const value = argumentValue(name);
  if (!value) throw new Error(`Missing required argument: ${name}`);
  return value;
}

function argumentValue(name) {
  const exactIndex = process.argv.indexOf(name);
  if (exactIndex !== -1) return process.argv[exactIndex + 1] || "";
  const prefixed = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : "";
}
