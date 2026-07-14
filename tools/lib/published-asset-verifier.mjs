import { createHash } from "node:crypto";

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_DELAY_MS = 1_000;

export async function waitForPublishedAsset({
  expectedBytes,
  publicUrl,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  fetchImpl = globalThis.fetch,
}) {
  const bytes = Buffer.from(expectedBytes);
  const expectedHash = sha256(bytes);
  const deadline = Date.now() + positiveNumber(timeoutMs, "timeoutMs");
  positiveNumber(requestTimeoutMs, "requestTimeoutMs");
  positiveNumber(retryDelayMs, "retryDelayMs");
  if (typeof fetchImpl !== "function") throw new Error("fetchImpl must be a function.");

  let attempts = 0;
  let lastRequestFailure = "no request was made";
  let lastResponseFailure = "";

  while (Date.now() < deadline) {
    attempts += 1;
    const requestUrl = new URL(publicUrl);
    requestUrl.searchParams.set("asset-verify", `${expectedHash.slice(0, 16)}-${attempts}`);
    const remainingMs = Math.max(1, deadline - Date.now());

    try {
      const response = await fetchImpl(requestUrl, {
        cache: "no-store",
        headers: { "cache-control": "no-cache" },
        signal: AbortSignal.timeout(Math.min(requestTimeoutMs, remainingMs)),
      });
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok) {
        await response.body?.cancel();
        lastResponseFailure = `HTTP ${response.status}`;
      } else if (!contentType.toLowerCase().startsWith("image/")) {
        await response.body?.cancel();
        lastResponseFailure = `unexpected content type ${contentType || "missing"}`;
      } else {
        const publishedBytes = Buffer.from(await response.arrayBuffer());
        const publishedHash = sha256(publishedBytes);
        if (publishedHash === expectedHash) {
          return {
            attempts,
            contentType,
            publicUrl: requestUrl.origin + requestUrl.pathname,
            sha256: publishedHash,
            size: publishedBytes.length,
          };
        }
        lastResponseFailure = `hash mismatch: expected ${expectedHash}, received ${publishedHash}`;
      }
    } catch (error) {
      lastRequestFailure = error.message;
    }

    const sleepMs = Math.min(retryDelayMs, Math.max(0, deadline - Date.now()));
    if (sleepMs > 0) await delay(sleepMs);
  }

  const failure = lastResponseFailure || lastRequestFailure;
  throw new Error(`Published asset verification failed for ${publicUrl}: ${failure}`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function positiveNumber(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return value;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
