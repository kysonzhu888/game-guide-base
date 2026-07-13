const MAX_NAME_LENGTH = 40;
const MAX_BODY_LENGTH = 600;
const MAX_COMMENTS_PER_RESPONSE = 30;
const RESEND_API_URL = "https://api.resend.com/emails";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const gameSlug = normalizeText(url.searchParams.get("gameSlug"), 80);
  if (!gameSlug) {
    return json({ error: "Missing gameSlug." }, 400);
  }

  const comments = await listComments(env, gameSlug);
  return json({ comments });
}

export async function onRequestPost(context) {
  const { request, env } = context;
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

  scheduleCommentNotification(context, {
    id,
    gameSlug,
    name,
    body,
    pageUrl: buildCommentPageUrl(request.url, gameSlug, env),
    siteName: env.COMMENT_SITE_NAME || new URL(request.url).hostname,
  });

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

function scheduleCommentNotification(context, comment) {
  if (!context.waitUntil) {
    return;
  }

  context.waitUntil(
    sendCommentNotification(context.env, comment).catch((error) => {
      console.warn("Comment notification failed", error);
    }),
  );
}

async function sendCommentNotification(env, comment) {
  const apiKey = normalizeSecret(env.RESEND_API_KEY);
  const recipients = splitRecipients(env.COMMENT_NOTIFY_TO || env.COMMENT_NOTIFY_EMAIL);
  const from = normalizeHeaderValue(env.COMMENT_NOTIFY_FROM);
  if (!apiKey || !recipients.length || !from) {
    return;
  }

  const subject = normalizeHeaderValue(`[${comment.siteName}] New comment on ${comment.gameSlug}`);
  const text = [
    `New comment on ${comment.siteName}`,
    "",
    `Page: ${comment.pageUrl}`,
    `Game slug: ${comment.gameSlug}`,
    `Name: ${comment.name}`,
    "",
    comment.body,
    "",
    `Comment ID: ${comment.id}`,
  ].join("\n");
  const html = `
    <h2>New comment on ${escapeHtml(comment.siteName)}</h2>
    <p><strong>Page:</strong> <a href="${escapeHtml(comment.pageUrl)}">${escapeHtml(comment.pageUrl)}</a></p>
    <p><strong>Game slug:</strong> ${escapeHtml(comment.gameSlug)}</p>
    <p><strong>Name:</strong> ${escapeHtml(comment.name)}</p>
    <blockquote>${escapeHtml(comment.body).replace(/\n/g, "<br>")}</blockquote>
    <p><small>Comment ID: ${escapeHtml(comment.id)}</small></p>
  `;

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend returned ${response.status}: ${await response.text()}`);
  }
}

function buildCommentPageUrl(requestUrl, gameSlug, env) {
  const url = new URL(requestUrl);
  const prefix = String(env.COMMENT_PAGE_PATH_PREFIX || "/games/").replace(/\/?$/, "/");
  url.pathname = `${prefix}${encodeURIComponent(gameSlug)}/`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function splitRecipients(value) {
  return String(value || "")
    .split(",")
    .map((item) => normalizeHeaderValue(item))
    .filter(Boolean);
}

function normalizeHeaderValue(value) {
  return String(value || "")
    .replace(/[\r\n]+/g, " ")
    .trim();
}

function normalizeSecret(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
