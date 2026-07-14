import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { waitForPublishedAsset } from "./lib/published-asset-verifier.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);

const dryRun = args.has("--dry-run");
const bucket = stringArg("--bucket", process.env.R2_BUCKET || "gameguidebase-media");
const uploadTimeoutSeconds = positiveInteger(
  process.env.R2_UPLOAD_TIMEOUT_SECONDS || "180",
  "R2_UPLOAD_TIMEOUT_SECONDS",
);
const uploadAttempts = positiveInteger(
  process.env.R2_UPLOAD_ATTEMPTS || "2",
  "R2_UPLOAD_ATTEMPTS",
);
const publicVerifyTimeoutSeconds = positiveInteger(
  process.env.R2_PUBLIC_VERIFY_TIMEOUT_SECONDS || "45",
  "R2_PUBLIC_VERIFY_TIMEOUT_SECONDS",
);
const sourcePrefixes = repeatedArgs("--source-prefix");
const mediaRoot = path.join(root, ".media");
const manifest = readJson("data/media-assets.generated.json");
const mediaBaseUrl = String(readJson("site.config.json").mediaBaseUrl || "").replace(/\/+$/, "");
const commandWrapper = path.join(__dirname, "run-until-output.mjs");
const npxBin = process.env.NPX_BIN || "npx";

if (!mediaBaseUrl) throw new Error("site.config.json mediaBaseUrl is required for upload verification.");

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

  const expectedBytes = fs.readFileSync(filePath);
  const publicUrl = new URL(entry.r2Key, `${mediaBaseUrl}/`).href;
  let uploaded = false;
  let lastFailure = "unknown failure";

  for (let attempt = 1; attempt <= uploadAttempts; attempt += 1) {
    const result = spawnSync(process.execPath, [
      commandWrapper,
      String(uploadTimeoutSeconds),
      "Upload complete.",
      npxBin,
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
        BROWSER: "none",
        CI: "true",
        WRANGLER_SEND_METRICS: "false",
      },
      stdio: "pipe",
    });

    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);

    try {
      const verification = await waitForPublishedAsset({
        expectedBytes,
        publicUrl,
        timeoutMs: publicVerifyTimeoutSeconds * 1_000,
      });
      console.log(
        `Uploaded ${entry.r2Key} and verified ${verification.size} public bytes after ${verification.attempts} check(s).`,
      );
      uploaded = true;
      break;
    } catch (error) {
      const commandFailure = result.error?.message || `exit status ${result.status}`;
      lastFailure = `command ${commandFailure}; ${error.message}`;
      if (attempt < uploadAttempts) {
        console.warn(`[R2 upload retry] key=${entry.r2Key} attempt=${attempt} reason=${lastFailure}`);
      }
    }
  }

  if (!uploaded) {
    throw new Error(
      `Upload failed for ${entry.r2Key} after ${uploadAttempts} attempt(s): ${lastFailure}`,
    );
  }
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
