import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFailureBody,
  normalizeFailureReason,
  reportDailyFailure,
} from "./lib/daily-failure-reporter.mjs";

test("normalizes a bounded single-line failure reason", () => {
  assert.equal(
    normalizeFailureReason("\u001b[31mBROWSER_PREFLIGHT_FAILED: bridge unavailable\u001b[0m\nsecret second line"),
    "BROWSER_PREFLIGHT_FAILED: bridge unavailable",
  );
  assert.equal(normalizeFailureReason("  "), "Workflow failed before producing a failure marker.");
});

test("builds a fail-closed Linear handoff", () => {
  const body = buildFailureBody({
    runUrl: "https://github.com/example/repo/actions/runs/123",
    reason: "CODEX_QUOTA_FAILED: quota unavailable",
    runDate: "2026-07-14",
  });
  assert.match(body, /2026-07-14/);
  assert.match(body, /actions\/runs\/123/);
  assert.match(body, /CODEX_QUOTA_FAILED/);
  assert.match(body, /没有攻略、媒体或部署可计为成功/);
});

test("verifies Uchuu and avoids duplicate Linear comments", async () => {
  const calls = [];
  const fetchImpl = async (_url, options) => {
    const payload = JSON.parse(options.body);
    calls.push(payload);
    if (payload.query.includes("DailyFailureContext")) {
      return Response.json({
        data: {
          viewer: { organization: { urlKey: "uchuu" } },
          teams: { nodes: [{ key: "UCH" }] },
          issue: {
            id: "issue-id",
            identifier: "UCH-125",
            comments: { nodes: [{ body: "Existing https://github.com/example/repo/actions/runs/123" }] },
          },
        },
      });
    }
    throw new Error("comment mutation must be skipped for an existing run URL");
  };

  const result = await reportDailyFailure({
    token: "not-a-real-token",
    issueIdentifier: "UCH-125",
    runUrl: "https://github.com/example/repo/actions/runs/123",
    reason: "failed",
    runDate: "2026-07-14",
    fetchImpl,
  });
  assert.deepEqual(result, { status: "duplicate", issue: "UCH-125" });
  assert.equal(calls.length, 1);
});

test("creates one comment after validating workspace, team, and issue", async () => {
  const calls = [];
  const fetchImpl = async (_url, options) => {
    const payload = JSON.parse(options.body);
    calls.push(payload);
    if (payload.query.includes("DailyFailureContext")) {
      return Response.json({
        data: {
          viewer: { organization: { urlKey: "uchuu" } },
          teams: { nodes: [{ key: "UCH" }] },
          issue: { id: "issue-id", identifier: "UCH-125", comments: { nodes: [] } },
        },
      });
    }
    return Response.json({ data: { commentCreate: { success: true, comment: { id: "comment-id" } } } });
  };

  const result = await reportDailyFailure({
    token: "not-a-real-token",
    issueIdentifier: "UCH-125",
    runUrl: "https://github.com/example/repo/actions/runs/456",
    reason: "browser failed",
    runDate: "2026-07-14",
    fetchImpl,
  });
  assert.deepEqual(result, { status: "created", issue: "UCH-125", commentId: "comment-id" });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].variables.input.issueId, "issue-id");
});
