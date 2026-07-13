import assert from "node:assert/strict";
import test from "node:test";

import { validateDailyRun } from "./lib/daily-guide-verifier.mjs";

const runDate = "2026-07-14";
const baselineRef = "a".repeat(40);

test("accepts exactly five new evidence-backed guides", () => {
  const fixture = dailyRunFixture();
  const result = validateDailyRun(fixture);

  assert.equal(result.baselineCount, 1);
  assert.equal(result.finalCount, 6);
  assert.equal(result.newGuides.length, 5);
  assert.deepEqual(result.newGuides, fixture.manifest.guides.map((guide) => guide.slug));
});

test("rejects a coverage refresh presented as five new guides", () => {
  const fixture = dailyRunFixture();
  fixture.afterGames = fixture.beforeGames;

  assert.throws(() => validateDailyRun(fixture), /exactly 5 new guides/i);
});

test("rejects duplicate source URLs", () => {
  const fixture = dailyRunFixture();
  fixture.afterGames[2].sourceUrl = fixture.afterGames[1].sourceUrl;

  assert.throws(() => validateDailyRun(fixture), /duplicate sourceUrl/i);
});

test("requires video evidence for dynamic games", () => {
  const fixture = dailyRunFixture();
  fixture.manifest.guides[0].evidence = fixture.manifest.guides[0].evidence
    .filter((item) => item.type !== "video");

  assert.throws(() => validateDailyRun(fixture), /video evidence/i);
});

function dailyRunFixture() {
  const beforeGames = [{
    slug: "loopit-existing-guide",
    sourceUrl: "https://share.loopit.me/game/existing",
  }];
  const newGames = Array.from({ length: 5 }, (_, index) => guideFixture(index + 1));
  const manifestGuides = newGames.map((game, index) => ({
    slug: game.slug,
    sourceUrl: game.sourceUrl,
    status: "verified",
    dynamic: index === 0,
    outcomes: [`Verified outcome ${index + 1}`],
    pending: [],
    evidence: index === 0
      ? [
          { type: "video", path: `${game.slug}/run-01.mp4` },
          { type: "frame", path: `${game.slug}/01-entry.jpg` },
        ]
      : [
          { type: "screenshot", path: `${game.slug}/01-entry.jpg` },
          { type: "screenshot", path: `${game.slug}/02-outcome.jpg` },
        ],
  }));

  const evidenceFiles = new Map();
  for (const guide of manifestGuides) {
    for (const evidence of guide.evidence) {
      evidenceFiles.set(evidence.path, {
        kind: evidence.type === "video" ? "video" : "image",
        size: evidence.type === "video" ? 50_000 : 5_000,
      });
    }
  }

  return {
    beforeGames,
    afterGames: [...beforeGames, ...newGames],
    manifest: {
      schemaVersion: 1,
      date: runDate,
      mode: "new-guides",
      targetCount: 5,
      baseline: { ref: baselineRef, gameCount: 1 },
      final: { gameCount: 6 },
      linear: { parentIssue: "UCH-41", dailyIssue: "UCH-120" },
      guides: manifestGuides,
      rejectedCandidates: [],
    },
    expectedCount: 5,
    expectedDate: runDate,
    expectedBaselineRef: baselineRef,
    mediaManifest: Object.fromEntries(newGames.flatMap((game) => (
      game.screenshots.map((shot) => [shot.src, { r2Key: shot.src.slice(1) }])
    ))),
    trackedPaths: new Set(newGames.flatMap((game) => (
      game.screenshots.map((shot) => shot.src.slice(1))
    ))),
    evidenceFiles,
  };
}

function guideFixture(index) {
  const slug = `loopit-new-guide-${index}`;
  return {
    platforms: ["Loopit app", "Mobile web playable"],
    sourcePlatform: "Loopit",
    sourcePlatformSlug: "loopit",
    slug,
    title: `New Guide ${index}`,
    genre: "Test game",
    difficulty: "A verified test fixture with a visible outcome.",
    searchIntent: `New Guide ${index} Loopit walkthrough`,
    sourceUrl: `https://share.loopit.me/game/new-${index}`,
    creator: `Creator ${index}`,
    creatorSlug: `creator-${index}`,
    stats: { views: "1K", likes: "100", comments: "10", remixes: "1" },
    summary: "A sufficiently detailed original summary based on the verified play session.",
    quickAnswer: "Use the visible control, verify the counter changes, and record the result screen.",
    basics: ["Entry state", "Visible goal", "Progress signal", "Result state"],
    controls: ["Tap the control", "Read the counter", "Retry after failure"],
    strategy: ["Start slowly", "Watch feedback", "Capture the outcome"],
    mistakes: ["Guessing outcomes", "Skipping evidence", "Ignoring failure states"],
    screenshots: [
      {
        src: `/assets/${slug}/01-entry.jpg`,
        alt: `${slug} entry state`,
        caption: "Verified entry state.",
      },
      {
        src: `/assets/${slug}/02-outcome.jpg`,
        alt: `${slug} verified outcome`,
        caption: "Verified gameplay outcome.",
      },
    ],
    faq: [
      ["How do I start?", "Use the visible start control."],
      ["What was verified?", "The entry and outcome states."],
      ["Was every branch cleared?", "Only the documented route was verified."],
    ],
    creatorContext: ["Display name captured from Loopit.", "Identity is not externally verified."],
    communityNotes: ["Guide text is based on the recorded play session."],
    coverageStatus: "Entry, controls, progress, and one outcome verified",
    coverageUpdated: runDate,
    lastUpdated: runDate,
    coverageChecklist: ["Entry verified", "Control verified", "Progress verified", "Outcome verified"],
    coverageNotes: ["Unverified branches remain explicitly pending."],
  };
}
