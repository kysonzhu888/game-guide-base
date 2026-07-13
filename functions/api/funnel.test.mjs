import assert from "node:assert/strict";
import test from "node:test";

import { onRequestPost } from "./funnel.js";

test("rejects unsupported funnel events without writing to D1", async () => {
  let prepared = false;
  const response = await onRequestPost({
    request: jsonRequest({ eventName: "arbitrary_event", pageType: "guide" }),
    env: {
      COMMENTS_DB: {
        prepare() {
          prepared = true;
        },
      },
    },
  });

  assert.equal(response.status, 400);
  assert.equal(prepared, false);
  assert.deepEqual(await response.json(), { error: "Unsupported funnel event." });
});

test("increments an anonymous daily funnel counter", async () => {
  const calls = [];
  const response = await onRequestPost({
    request: jsonRequest({
      eventName: "license_success",
      pageType: "access",
      gameSlug: "loopit-love-is-love",
    }),
    env: {
      COMMENTS_DB: {
        prepare(query) {
          calls.push({ query });
          return {
            bind(...values) {
              calls.at(-1).values = values;
              return {
                async run() {
                  calls.at(-1).ran = true;
                },
              };
            },
          };
        },
      },
    },
  });

  assert.equal(response.status, 204);
  assert.equal(calls.length, 1);
  assert.match(calls[0].query, /ON CONFLICT/);
  assert.deepEqual(calls[0].values, [
    "license_success",
    "access",
    "loopit-love-is-love",
  ]);
  assert.equal(calls[0].ran, true);
});

function jsonRequest(payload) {
  return new Request("https://gameguidebase.com/api/funnel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
