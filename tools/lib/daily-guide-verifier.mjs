const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOOPIT_SOURCE = /^https:\/\/share\.loopit\.me\/game\/[^/?#]+/;
const ISSUE_ID = /^UCH-\d+$/;

const REQUIRED_ARRAYS = {
  basics: 4,
  controls: 3,
  strategy: 3,
  mistakes: 3,
  faq: 3,
  screenshots: 2,
  creatorContext: 2,
  communityNotes: 1,
  coverageChecklist: 4,
  coverageNotes: 1,
};

export function validateDailyRun({
  beforeGames,
  afterGames,
  manifest,
  expectedCount = 5,
  expectedDate,
  expectedBaselineRef,
  mediaManifest,
  trackedPaths,
  evidenceFiles,
}) {
  assertArray(beforeGames, "beforeGames");
  assertArray(afterGames, "afterGames");
  assertObject(manifest, "manifest");
  assertObject(mediaManifest, "mediaManifest");

  validateUnique(beforeGames, "slug");
  validateUnique(beforeGames, "sourceUrl");
  validateUnique(afterGames, "slug");
  validateUnique(afterGames, "sourceUrl");

  const beforeSlugs = new Set(beforeGames.map((game) => game.slug));
  const afterSlugs = new Set(afterGames.map((game) => game.slug));
  const removedSlugs = [...beforeSlugs].filter((slug) => !afterSlugs.has(slug));
  if (removedSlugs.length) {
    throw new Error(`Daily run removed existing guides: ${removedSlugs.join(", ")}`);
  }

  const newGames = afterGames.filter((game) => !beforeSlugs.has(game.slug));
  if (newGames.length !== expectedCount) {
    throw new Error(`Expected exactly ${expectedCount} new guides, found ${newGames.length}. A coverage refresh does not count.`);
  }

  validateManifest({
    manifest,
    expectedCount,
    expectedDate,
    expectedBaselineRef,
    baselineCount: beforeGames.length,
    finalCount: afterGames.length,
  });

  const manifestBySlug = uniqueMap(manifest.guides, "slug", "manifest guide");
  const newSlugs = newGames.map((game) => game.slug);
  const unexpectedManifestSlugs = [...manifestBySlug.keys()]
    .filter((slug) => !newSlugs.includes(slug));
  if (manifestBySlug.size !== expectedCount || unexpectedManifestSlugs.length) {
    throw new Error("Manifest guides must match the five newly added guide slugs exactly.");
  }

  for (const game of newGames) {
    validateGuide(game, manifestBySlug.get(game.slug), {
      expectedDate,
      mediaManifest,
      trackedPaths,
      evidenceFiles,
    });
  }

  return {
    baselineCount: beforeGames.length,
    finalCount: afterGames.length,
    newGuides: newSlugs,
    evidenceCount: manifest.guides.reduce((total, guide) => total + guide.evidence.length, 0),
  };
}

function validateManifest({
  manifest,
  expectedCount,
  expectedDate,
  expectedBaselineRef,
  baselineCount,
  finalCount,
}) {
  if (manifest.schemaVersion !== 1) throw new Error("Manifest schemaVersion must be 1.");
  if (manifest.mode !== "new-guides") throw new Error("Manifest mode must be new-guides.");
  if (!ISO_DATE.test(manifest.date || "")) throw new Error("Manifest date must be YYYY-MM-DD.");
  if (expectedDate && manifest.date !== expectedDate) {
    throw new Error(`Manifest date ${manifest.date} does not match ${expectedDate}.`);
  }
  if (manifest.targetCount !== expectedCount) {
    throw new Error(`Manifest targetCount must be ${expectedCount}.`);
  }
  assertObject(manifest.baseline, "manifest.baseline");
  assertObject(manifest.final, "manifest.final");
  if (manifest.baseline.gameCount !== baselineCount) {
    throw new Error("Manifest baseline count does not match the baseline ref.");
  }
  if (manifest.final.gameCount !== finalCount) {
    throw new Error("Manifest final count does not match the final ref.");
  }
  if (expectedBaselineRef && manifest.baseline.ref !== expectedBaselineRef) {
    throw new Error("Manifest baseline ref does not match the workflow baseline SHA.");
  }
  if (!Array.isArray(manifest.guides) || manifest.guides.length !== expectedCount) {
    throw new Error(`Manifest must contain exactly ${expectedCount} guides.`);
  }
  if (!Array.isArray(manifest.rejectedCandidates)) {
    throw new Error("Manifest rejectedCandidates must be an array.");
  }
  assertObject(manifest.linear, "manifest.linear");
  if (manifest.linear.parentIssue !== "UCH-41") {
    throw new Error("Manifest Linear parent must be UCH-41.");
  }
  if (!ISSUE_ID.test(manifest.linear.dailyIssue || "")) {
    throw new Error("Manifest must include the daily Uchuu Linear issue id.");
  }
}

function validateGuide(game, manifestGuide, context) {
  if (!manifestGuide) throw new Error(`Missing manifest entry for ${game.slug}.`);
  assertText(game.slug, "game.slug");
  if (!/^loopit-[a-z0-9-]+$/.test(game.slug)) {
    throw new Error(`Invalid Loopit slug: ${game.slug}`);
  }
  if (!LOOPIT_SOURCE.test(game.sourceUrl || "")) {
    throw new Error(`Invalid Loopit sourceUrl for ${game.slug}.`);
  }
  if (game.sourcePlatform !== "Loopit" || game.sourcePlatformSlug !== "loopit") {
    throw new Error(`${game.slug} must identify Loopit as its source platform.`);
  }

  for (const field of [
    "title", "genre", "difficulty", "searchIntent", "creator", "creatorSlug",
    "summary", "quickAnswer", "coverageStatus",
  ]) {
    assertText(game[field], `${game.slug}.${field}`);
  }
  if (game.summary.length < 50 || game.quickAnswer.length < 50) {
    throw new Error(`${game.slug} summary and quickAnswer must contain useful original detail.`);
  }
  for (const [field, minimum] of Object.entries(REQUIRED_ARRAYS)) {
    if (!Array.isArray(game[field]) || game[field].length < minimum) {
      throw new Error(`${game.slug}.${field} must contain at least ${minimum} items.`);
    }
  }
  if (game.lastUpdated !== context.expectedDate || game.coverageUpdated !== context.expectedDate) {
    throw new Error(`${game.slug} timestamps must match the daily run date.`);
  }

  for (const [index, row] of game.faq.entries()) {
    if (!Array.isArray(row) || row.length !== 2 || row.some((value) => !String(value || "").trim())) {
      throw new Error(`${game.slug}.faq[${index}] must be a question and answer pair.`);
    }
  }
  for (const [index, shot] of game.screenshots.entries()) {
    assertObject(shot, `${game.slug}.screenshots[${index}]`);
    for (const field of ["src", "alt", "caption"]) {
      assertText(shot[field], `${game.slug}.screenshots[${index}].${field}`);
    }
    if (!shot.src.startsWith(`/assets/${game.slug}/`)) {
      throw new Error(`${game.slug} screenshot paths must stay inside its asset directory.`);
    }
    const trackedPath = shot.src.slice(1);
    if (!context.trackedPaths?.has(trackedPath)) {
      throw new Error(`Missing tracked screenshot asset: ${trackedPath}`);
    }
    if (!context.mediaManifest[shot.src]?.r2Key) {
      throw new Error(`Missing R2 media manifest entry: ${shot.src}`);
    }
  }

  if (manifestGuide.sourceUrl !== game.sourceUrl || manifestGuide.status !== "verified") {
    throw new Error(`${game.slug} manifest source and verified status must match the guide.`);
  }
  if (!Array.isArray(manifestGuide.outcomes) || !manifestGuide.outcomes.length) {
    throw new Error(`${game.slug} must record at least one verified gameplay outcome.`);
  }
  if (!Array.isArray(manifestGuide.pending)) {
    throw new Error(`${game.slug} pending cases must be an array.`);
  }
  if (!Array.isArray(manifestGuide.evidence) || !manifestGuide.evidence.length) {
    throw new Error(`${game.slug} must record evidence files.`);
  }

  const imageEvidence = manifestGuide.evidence.filter((item) => (
    item.type === "frame" || item.type === "screenshot"
  ));
  const videoEvidence = manifestGuide.evidence.filter((item) => item.type === "video");
  if (manifestGuide.dynamic && !videoEvidence.length) {
    throw new Error(`${game.slug} is dynamic and requires video evidence.`);
  }
  if (!manifestGuide.dynamic && imageEvidence.length < 2) {
    throw new Error(`${game.slug} requires at least two screenshot or frame evidence files.`);
  }

  for (const evidence of manifestGuide.evidence) {
    validateEvidence(game.slug, evidence, context.evidenceFiles);
  }
}

function validateEvidence(slug, evidence, evidenceFiles) {
  assertObject(evidence, `${slug} evidence`);
  if (!new Set(["video", "frame", "screenshot"]).has(evidence.type)) {
    throw new Error(`${slug} has an unsupported evidence type.`);
  }
  assertText(evidence.path, `${slug} evidence path`);
  if (evidence.path.startsWith("/") || evidence.path.split("/").includes("..")) {
    throw new Error(`${slug} evidence paths must be safe relative paths.`);
  }
  const file = evidenceFiles?.get(evidence.path);
  if (!file) throw new Error(`Missing evidence file: ${evidence.path}`);
  const expectedKind = evidence.type === "video" ? "video" : "image";
  if (file.kind !== expectedKind) {
    throw new Error(`Evidence MIME mismatch for ${evidence.path}.`);
  }
  const minimumSize = expectedKind === "video" ? 10_000 : 1_000;
  if (file.size < minimumSize) {
    throw new Error(`Evidence file is too small to be credible: ${evidence.path}`);
  }
}

function validateUnique(rows, field) {
  const seen = new Set();
  for (const row of rows) {
    const value = String(row?.[field] || "").trim();
    if (!value) throw new Error(`Missing ${field}.`);
    if (seen.has(value)) throw new Error(`Duplicate ${field}: ${value}`);
    seen.add(value);
  }
}

function uniqueMap(rows, field, label) {
  const result = new Map();
  for (const row of rows) {
    const value = String(row?.[field] || "").trim();
    if (!value || result.has(value)) throw new Error(`Duplicate or missing ${label} ${field}.`);
    result.set(value, row);
  }
  return result;
}

function assertArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

function assertText(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be non-empty text.`);
  }
}
