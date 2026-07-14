import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { waitForPublishedAsset } from "./lib/published-asset-verifier.mjs";

test("waits until the public image matches the uploaded bytes", async (t) => {
  const expectedBytes = Buffer.from("expected-image-bytes");
  let requests = 0;
  const server = http.createServer((_request, response) => {
    requests += 1;
    if (requests === 1) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": "image/jpeg" }).end(expectedBytes);
  });
  const url = await listen(server);
  t.after(() => server.close());

  const result = await waitForPublishedAsset({
    expectedBytes,
    publicUrl: url,
    timeoutMs: 1_000,
    retryDelayMs: 10,
    requestTimeoutMs: 200,
  });

  assert.equal(result.attempts, 2);
  assert.equal(result.size, expectedBytes.length);
  assert.match(result.contentType, /^image\/jpeg/);
});

test("rejects a public object with different bytes", async (t) => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "image/jpeg" }).end("stale-image");
  });
  const url = await listen(server);
  t.after(() => server.close());

  await assert.rejects(() => waitForPublishedAsset({
    expectedBytes: Buffer.from("new-image"),
    publicUrl: url,
    timeoutMs: 80,
    retryDelayMs: 10,
    requestTimeoutMs: 50,
  }), /hash mismatch/i);
});

test("rejects a non-image public response", async (t) => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html" }).end("not an image");
  });
  const url = await listen(server);
  t.after(() => server.close());

  await assert.rejects(() => waitForPublishedAsset({
    expectedBytes: Buffer.from("not an image"),
    publicUrl: url,
    timeoutMs: 80,
    retryDelayMs: 10,
    requestTimeoutMs: 50,
  }), /content type/i);
});

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}/asset.jpg`);
    });
  });
}
