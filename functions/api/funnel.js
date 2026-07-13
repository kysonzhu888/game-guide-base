const FUNNEL_EVENT_NAMES = new Set([
  "checkout_click",
  "access_view",
  "license_attempt",
  "license_success",
  "license_failure",
]);
const FUNNEL_PAGE_TYPES = new Set(["home", "guide", "access"]);
const MAX_EVENT_NAME_LENGTH = 40;
const MAX_PAGE_TYPE_LENGTH = 20;
const MAX_GAME_SLUG_LENGTH = 100;

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const eventName = normalizeToken(payload.eventName, MAX_EVENT_NAME_LENGTH);
  if (!FUNNEL_EVENT_NAMES.has(eventName)) {
    return json({ error: "Unsupported funnel event." }, 400);
  }

  const pageType = normalizeToken(payload.pageType, MAX_PAGE_TYPE_LENGTH);
  if (!FUNNEL_PAGE_TYPES.has(pageType)) {
    return json({ error: "Unsupported funnel page type." }, 400);
  }

  const gameSlug = normalizeSlug(payload.gameSlug);
  await env.COMMENTS_DB
    .prepare(`
      INSERT INTO funnel_daily (event_date, event_name, page_type, game_slug, event_count)
      VALUES (date('now'), ?, ?, ?, 1)
      ON CONFLICT (event_date, event_name, page_type, game_slug)
      DO UPDATE SET event_count = event_count + 1
    `)
    .bind(eventName, pageType, gameSlug)
    .run();

  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}

function normalizeToken(value, maxLength) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .slice(0, maxLength);
}

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, MAX_GAME_SLUG_LENGTH);
}

function json(body, status) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
