const MAX_NAME_LENGTH = 40;
const MAX_BODY_LENGTH = 600;
const MAX_COMMENTS_PER_RESPONSE = 30;

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const gameSlug = normalizeText(url.searchParams.get("gameSlug"), 80);
  if (!gameSlug) {
    return json({ error: "Missing gameSlug." }, 400);
  }

  const comments = await listComments(env, gameSlug);
  return json({ comments });
}

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const gameSlug = normalizeText(payload.gameSlug, 80);
  const name = normalizeText(payload.name || "Player", MAX_NAME_LENGTH) || "Player";
  const body = normalizeText(payload.comment || payload.body, MAX_BODY_LENGTH);

  if (!gameSlug) {
    return json({ error: "Missing gameSlug." }, 400);
  }

  if (!body) {
    return json({ error: "Comment cannot be empty." }, 400);
  }

  const id = crypto.randomUUID();
  await env.COMMENTS_DB
    .prepare(`
      INSERT INTO comments (id, game_slug, name, body)
      VALUES (?, ?, ?, ?)
    `)
    .bind(id, gameSlug, name, body)
    .run();

  const comments = await listComments(env, gameSlug);
  return json({ ok: true, comments }, 201);
}

async function listComments(env, gameSlug) {
  const { results } = await env.COMMENTS_DB
    .prepare(`
      SELECT id, name, body, created_at
      FROM comments
      WHERE game_slug = ? AND status = 'visible'
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .bind(gameSlug, MAX_COMMENTS_PER_RESPONSE)
    .all();

  return (results || []).map((row) => ({
    id: row.id,
    name: row.name,
    body: row.body,
    createdAt: row.created_at,
  }));
}

function normalizeText(value, maxLength) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
