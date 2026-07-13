import assert from "node:assert/strict";
import {
  guideUpdateHistory,
  guideUpdatedISO,
  latestContentUpdatedISO,
} from "./update-history.mjs";

const coverageOnly = {
  lastUpdated: "2026-07-02",
  coverageUpdated: "2026-07-13",
  coverageStatus: "Level 1 clear and Level 2 failure verified",
  coverageChecklist: ["Level 1 reached 100%.", "Level 2 showed Try Again."],
};

assert.equal(guideUpdatedISO(coverageOnly, "2026-07-01"), "2026-07-13");
assert.deepEqual(guideUpdateHistory(coverageOnly), [{
  date: "2026-07-13",
  summary: "Level 1 clear and Level 2 failure verified",
  details: ["Level 1 reached 100%.", "Level 2 showed Try Again."],
}]);

const explicitHistory = {
  coverageUpdated: "2026-07-13",
  coverageStatus: "Current coverage summary",
  updateHistory: [
    { date: "2026-07-04", summary: "Initial two-level route captured" },
    { date: "2026-07-13", summary: "Success and failure branches refreshed", details: ["Added result keyframes."] },
    { date: "not-a-date", summary: "Ignore malformed history" },
  ],
};

assert.deepEqual(guideUpdateHistory(explicitHistory), [
  {
    date: "2026-07-13",
    summary: "Success and failure branches refreshed",
    details: ["Added result keyframes."],
  },
  {
    date: "2026-07-04",
    summary: "Initial two-level route captured",
    details: [],
  },
]);

assert.equal(latestContentUpdatedISO([
  coverageOnly,
  { lastUpdated: "2026-07-14" },
  { updateHistory: [{ date: "2026-07-12", summary: "Older revision" }] },
], "2026-07-01"), "2026-07-14");
assert.equal(latestContentUpdatedISO([], "2026-07-01"), "2026-07-01");

console.log("update-history tests passed");
