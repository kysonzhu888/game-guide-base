const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function guideUpdateHistory(game = {}) {
  const entries = normalizeExplicitHistory(game.updateHistory);
  const dates = new Set(entries.map((entry) => entry.date));

  const coverageDate = normalizeISODate(game.coverageUpdated);
  if (coverageDate && !dates.has(coverageDate)) {
    entries.push({
      date: coverageDate,
      summary: normalizeText(game.coverageStatus) || "Coverage pass refreshed",
      details: normalizeDetails(game.coverageChecklist),
    });
    dates.add(coverageDate);
  }

  return entries.sort((left, right) => right.date.localeCompare(left.date));
}

export function guideUpdatedISO(game = {}, fallback = "") {
  const candidates = [
    ...guideUpdateHistory(game).map((entry) => entry.date),
    normalizeISODate(game.coverageUpdated),
    normalizeISODate(game.lastUpdated),
    normalizeISODate(fallback),
  ].filter(Boolean);

  return candidates.sort().at(-1) || "";
}

export function latestContentUpdatedISO(games = [], fallback = "") {
  const candidates = games.flatMap((game) => [
    ...guideUpdateHistory(game).map((entry) => entry.date),
    normalizeISODate(game.coverageUpdated),
    normalizeISODate(game.lastUpdated),
  ]);
  const normalizedFallback = normalizeISODate(fallback);
  if (normalizedFallback) candidates.push(normalizedFallback);
  return candidates.filter(Boolean).sort().at(-1) || "";
}

function normalizeExplicitHistory(history) {
  if (!Array.isArray(history)) return [];

  const seen = new Set();
  const entries = [];
  for (const candidate of history) {
    const date = normalizeISODate(candidate?.date);
    const summary = normalizeText(candidate?.summary);
    if (!date || !summary) continue;

    const key = `${date}\n${summary}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      date,
      summary,
      details: normalizeDetails(candidate?.details),
    });
  }
  return entries;
}

function normalizeDetails(details) {
  if (!Array.isArray(details)) return [];
  return details.map(normalizeText).filter(Boolean);
}

function normalizeISODate(value) {
  const date = normalizeText(value);
  if (!ISO_DATE_PATTERN.test(date)) return "";
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? "" : date;
}

function normalizeText(value) {
  return String(value || "").trim();
}
