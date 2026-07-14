import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);

const dryRun = args.has("--dry-run");
const bucket = stringArg("--bucket", process.env.R2_BUCKET || "gameguidebase-media");
const uploadTimeoutMs = positiveInteger(
  process.env.R2_UPLOAD_TIMEOUT_MS || "120000",
  "R2_UPLOAD_TIMEOUT_MS",
);
const sourcePrefixes = repeatedArgs("--source-prefix");
const mediaRoot = path.join(root, ".media");
const manifest = readJson("data/media-assets.generated.json");

const entries = Object.entries(manifest)
  .filter(([sourcePath]) => !sourcePrefixes.length
    || sourcePrefixes.some((prefix) => sourcePath.startsWith(prefix)))
  .map(([, entry]) => entry);
if (!entries.length) {
  throw new Error("No matching media assets found. Run node tools/prepare-media.mjs first and check --source-prefix values.");
}

for (const entry of entries) {
  const filePath = path.join(root, entry.localOutput);
  if (!filePath.startsWith(mediaRoot) || !fs.existsSync(filePath)) {
    throw new Error(`Missing prepared media file: ${entry.localOutput}`);
  }

  const destination = `${bucket}/${entry.r2Key}`;
  if (dryRun) {
    console.log(`Would upload ${entry.localOutput} -> ${destination}`);
    continue;
  }

  const result = spawnSync("npx", [
    "--yes",
    "wrangler@4.110.0",
    "r2",
    "object",
    "put",
    destination,
    "--remote",
    "--file",
    filePath,
    "--content-type",
    "image/jpeg",
    "--cache-control",
    "public, max-age=31536000, immutable",
  ], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      WRANGLER_SEND_METRICS: "false",
    },
    stdio: "pipe",
    timeout: uploadTimeoutMs,
  });

  if (result.error) {
    throw new Error(`Upload command failed for ${entry.r2Key}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`Upload failed for ${entry.r2Key}\n${result.stderr || result.stdout}`);
  }
  console.log(`Uploaded ${entry.r2Key}`);
}

console.log(`${dryRun ? "Checked" : "Uploaded"} ${entries.length} media assets to ${bucket}.`);

function stringArg(name, fallback) {
  const raw = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (!raw) return fallback;
  const value = raw.slice(name.length + 1).trim();
  if (!value) throw new Error(`Invalid ${name}: empty value`);
  return value;
}

function repeatedArgs(name) {
  return rawArgs
    .filter((arg) => arg.startsWith(`${name}=`))
    .map((arg) => arg.slice(name.length + 1).trim())
    .map((value) => {
      if (!value) throw new Error(`Invalid ${name}: empty value`);
      return value;
    });
}

function positiveInteger(raw, name) {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Invalid ${name}: expected a positive integer`);
  }
  return value;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}
