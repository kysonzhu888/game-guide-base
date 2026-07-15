import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SCHEMA_VERSION = "1.0";
const API_PATH = "/api/v1/games.json";
const SCHEMA_PATH = "/api/v1/games.schema.json";
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function createPublicGameCatalog({
  games,
  siteUrl,
  siteName = "Game Guide Base",
  dataUpdatedAt,
  isPremium = () => false,
  updatedAtForGame = defaultUpdatedAt,
}) {
  if (!Array.isArray(games)) throw new TypeError("games must be an array.");
  if (typeof isPremium !== "function") throw new TypeError("isPremium must be a function.");
  if (typeof updatedAtForGame !== "function") {
    throw new TypeError("updatedAtForGame must be a function.");
  }

  const normalizedSiteUrl = normalizeSiteUrl(siteUrl);
  const seenSlugs = new Set();
  const publicGames = games.map((game) => {
    const slug = requiredText(game?.slug, "slug");
    if (!SLUG_PATTERN.test(slug)) throw new Error(`Invalid game slug: ${slug}`);
    if (seenSlugs.has(slug)) throw new Error(`Duplicate game slug: ${slug}`);
    seenSlugs.add(slug);

    return {
      slug,
      title: requiredText(game.title, `${slug}.title`),
      genre: requiredText(game.genre, `${slug}.genre`),
      platforms: stringList(game.platforms, `${slug}.platforms`),
      sourcePlatform: requiredText(game.sourcePlatform, `${slug}.sourcePlatform`),
      creator: requiredText(game.creator, `${slug}.creator`),
      guideUrl: `${normalizedSiteUrl}/games/${slug}/`,
      sourceUrl: normalizeSourceUrl(game.sourceUrl, `${slug}.sourceUrl`),
      access: isPremium(game) ? "premium" : "free",
      updatedAt: optionalDate(updatedAtForGame(game), `${slug}.updatedAt`),
    };
  }).sort((left, right) => left.slug.localeCompare(right.slug));

  return {
    schemaUrl: `${normalizedSiteUrl}${SCHEMA_PATH}`,
    schemaVersion: SCHEMA_VERSION,
    dataUpdatedAt: optionalDate(dataUpdatedAt, "dataUpdatedAt"),
    site: {
      name: requiredText(siteName, "siteName"),
      url: `${normalizedSiteUrl}/`,
      developerDocsUrl: `${normalizedSiteUrl}/developers/`,
    },
    count: publicGames.length,
    games: publicGames,
  };
}

export function createPublicGameCatalogSchema(siteUrl) {
  const normalizedSiteUrl = normalizeSiteUrl(siteUrl);
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `${normalizedSiteUrl}${SCHEMA_PATH}`,
    title: "Game Guide Base public game catalog",
    description: "Versioned public metadata for Game Guide Base guides. Premium walkthrough content and media are intentionally excluded.",
    type: "object",
    additionalProperties: false,
    required: ["schemaUrl", "schemaVersion", "dataUpdatedAt", "site", "count", "games"],
    properties: {
      schemaUrl: { const: `${normalizedSiteUrl}${SCHEMA_PATH}` },
      schemaVersion: { const: SCHEMA_VERSION },
      dataUpdatedAt: dateOrNullSchema(),
      site: {
        type: "object",
        additionalProperties: false,
        required: ["name", "url", "developerDocsUrl"],
        properties: {
          name: { type: "string", minLength: 1 },
          url: { type: "string", format: "uri" },
          developerDocsUrl: { type: "string", format: "uri" },
        },
      },
      count: { type: "integer", minimum: 0 },
      games: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "slug",
            "title",
            "genre",
            "platforms",
            "sourcePlatform",
            "creator",
            "guideUrl",
            "sourceUrl",
            "access",
            "updatedAt",
          ],
          properties: {
            slug: { type: "string", pattern: SLUG_PATTERN.source },
            title: { type: "string", minLength: 1 },
            genre: { type: "string", minLength: 1 },
            platforms: {
              type: "array",
              minItems: 1,
              uniqueItems: true,
              items: { type: "string", minLength: 1 },
            },
            sourcePlatform: { type: "string", minLength: 1 },
            creator: { type: "string", minLength: 1 },
            guideUrl: { type: "string", format: "uri" },
            sourceUrl: { type: "string", format: "uri" },
            access: { enum: ["free", "premium"] },
            updatedAt: dateOrNullSchema(),
          },
        },
      },
    },
  };
}

export async function writePublicGameCatalog({ root, catalog, schema }) {
  const output = path.join(root, "api", "v1");
  await mkdir(output, { recursive: true });
  await Promise.all([
    writeFile(path.join(output, "games.json"), `${JSON.stringify(catalog, null, 2)}\n`),
    writeFile(path.join(output, "games.schema.json"), `${JSON.stringify(schema, null, 2)}\n`),
  ]);
}

export function renderDeveloperCatalogBody(catalog) {
  const endpoint = API_PATH;
  const schemaEndpoint = SCHEMA_PATH;
  return `
    <main class="article-page">
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="/">Home</a><span>/</span><span>Developer data</span>
      </nav>
      <section class="guide-hero compact-hero">
        <div>
          <p class="kicker">Open catalog · schema ${escapeHtml(catalog.schemaVersion)}</p>
          <h1>Game Guide Base data for tools and research</h1>
          <p>Browse ${catalog.count} games or consume the same versioned, machine-readable catalog. The feed contains discovery metadata only—never premium walkthroughs, screenshots, FAQ answers, controls, or strategy.</p>
        </div>
      </section>

      <section class="article-grid">
        <article class="article-main">
          <section class="guide-section">
            <h2>Static API endpoints</h2>
            <ul>
              <li><a href="${endpoint}"><code>${endpoint}</code></a> — public catalog JSON.</li>
              <li><a href="${schemaEndpoint}"><code>${schemaEndpoint}</code></a> — JSON Schema Draft 2020-12 contract.</li>
            </ul>
            <p>No authentication is required. Pin integrations to <code>/api/v1/</code>; a breaking contract change will use a new versioned path.</p>
          </section>
          <section class="guide-section">
            <h2>Usage and attribution</h2>
            <p>Link users to each <code>guideUrl</code> and preserve the named source platform. Screenshots and underlying game media are deliberately excluded because this catalog does not grant rights to third-party media.</p>
          </section>
        </article>
        <aside class="article-aside">
          <section class="facts-panel">
            <h2>Catalog status</h2>
            <dl>
              <div><dt>Schema</dt><dd>${escapeHtml(catalog.schemaVersion)}</dd></div>
              <div><dt>Games</dt><dd>${catalog.count}</dd></div>
              <div><dt>Data updated</dt><dd>${escapeHtml(catalog.dataUpdatedAt || "Not recorded")}</dd></div>
              <div><dt>Format</dt><dd>Static JSON</dd></div>
            </dl>
          </section>
        </aside>
      </section>

      <section class="section-head">
        <div><p class="kicker">Human-readable browser</p><h2>Browse public game metadata</h2></div>
      </section>
      <form class="search-panel" role="search" action="/developers/" onsubmit="return false">
        <label for="guide-search">Filter by game, genre, or platform</label>
        <div class="search-row">
          <input id="guide-search" type="search" placeholder="Search title, genre, platform..." autocomplete="off">
          <button type="button" data-clear-search>Clear</button>
        </div>
      </form>
      <section class="quick-nav" data-guide-list>
        ${catalog.games.map(renderCatalogCard).join("")}
      </section>
    </main>
  `;
}

function renderCatalogCard(game) {
  return `
    <article data-guide-card data-title="${escapeHtml(`${game.title} ${game.creator}`.toLowerCase())}" data-genre="${escapeHtml(game.genre.toLowerCase())}" data-platform="${escapeHtml(game.sourcePlatform.toLowerCase())}">
      <a class="genre-chip" href="/games/${escapeHtml(game.slug)}/">
        <span><b>${escapeHtml(game.title)}</b><br><small>${escapeHtml(game.genre)} · ${escapeHtml(game.creator)}</small></span>
        <strong aria-label="${escapeHtml(game.access)} access">${game.access === "premium" ? "P" : "F"}</strong>
      </a>
    </article>
  `;
}

function defaultUpdatedAt(game) {
  return game?.coverageUpdated || game?.lastUpdated || null;
}

function requiredText(value, fieldName) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`Public catalog requires ${fieldName}.`);
  return text;
}

function stringList(value, fieldName) {
  if (!Array.isArray(value)) throw new Error(`Public catalog requires ${fieldName}.`);
  const items = [...new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean))];
  if (!items.length) throw new Error(`Public catalog requires ${fieldName}.`);
  return items;
}

function optionalDate(value, fieldName) {
  if (value == null || String(value).trim() === "") return null;
  const date = String(value).trim();
  if (!DATE_PATTERN.test(date)) throw new Error(`Public catalog ${fieldName} must use YYYY-MM-DD.`);
  return date;
}

function normalizeSiteUrl(value) {
  const url = normalizeHttpUrl(value, "siteUrl");
  return url.replace(/\/+$/, "");
}

function normalizeSourceUrl(value, fieldName) {
  const sourceUrl = new URL(normalizeHttpUrl(value, fieldName));
  sourceUrl.search = "";
  sourceUrl.hash = "";
  return sourceUrl.toString();
}

function normalizeHttpUrl(value, fieldName) {
  const text = requiredText(value, fieldName);
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`Public catalog ${fieldName} must be an absolute HTTP URL.`);
  }
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new Error(`Public catalog ${fieldName} must be an absolute HTTP URL.`);
  }
  return url.toString();
}

function dateOrNullSchema() {
  return { anyOf: [{ type: "string", format: "date" }, { type: "null" }] };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}
