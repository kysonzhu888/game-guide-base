import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const args = new Set(process.argv.slice(2));

const dryRun = args.has("--dry-run");
const bucket = stringArg("--bucket", process.env.R2_BUCKET || "gameguidebase-media");
const mediaRoot = path.join(root, ".media");
const manifest = readJson("data/media-assets.generated.json");

const entries = Object.values(manifest);
if (!entries.length) {
  throw new Error("No media assets found. Run node tools/prepare-media.mjs first.");
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
    "wrangler",
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
    stdio: "pipe",
  });

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

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}
