import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createPublicGameCatalog,
  createPublicGameCatalogSchema,
  renderDeveloperCatalogBody,
  writePublicGameCatalog,
} from "./lib/public-catalog.mjs";

const games = [
  {
    slug: "beta-game",
    title: "Beta & Beyond",
    genre: "Puzzle",
    platforms: ["Loopit app", "Mobile web playable"],
    sourcePlatform: "Loopit",
    creator: "Creator <Two>",
    summary: "Passcode 4126 must stay inside the guide.",
    sourceUrl: "https://share.loopit.me/game/beta?l_data=private-tracking#share",
    coverageUpdated: "2026-07-14",
    strategy: ["Paid strategy must stay private."],
    screenshots: [{ src: "/assets/private.png" }],
    faq: [["Private question", "Private answer"]],
  },
  {
    slug: "alpha-game",
    title: "Alpha Game",
    genre: "Arcade",
    platforms: ["Loopit app"],
    sourcePlatform: "Loopit",
    creator: "Creator One",
    summary: "A public summary for Alpha.",
    sourceUrl: "https://share.loopit.me/game/alpha",
  },
];

test("public catalog is deterministic and excludes premium guide content", () => {
  const catalog = createPublicGameCatalog({
    games,
    siteUrl: "https://gameguidebase.com/",
    apiBaseUrl: "https://game-guide-base.pages.dev/",
    dataUpdatedAt: "2026-07-15",
    isPremium: (game) => game.slug === "beta-game",
  });

  assert.equal(catalog.schemaVersion, "1.0");
  assert.equal(catalog.schemaUrl, "https://game-guide-base.pages.dev/api/v1/games.schema.json");
  assert.equal(Object.hasOwn(catalog, "$schema"), false);
  assert.equal(catalog.count, 2);
  assert.deepEqual(catalog.games.map((game) => game.slug), ["alpha-game", "beta-game"]);
  assert.equal(catalog.games[0].guideUrl, "https://gameguidebase.com/games/alpha-game/");
  assert.equal(catalog.games[0].updatedAt, null);
  assert.equal(catalog.games[1].access, "premium");
  assert.equal(catalog.games[1].updatedAt, "2026-07-14");
  assert.equal(catalog.games[1].sourceUrl, "https://share.loopit.me/game/beta");

  const serialized = JSON.stringify(catalog);
  assert.doesNotMatch(serialized, /4126|Paid strategy|private\.png|Private question|Private answer|private-tracking/);
  assert.doesNotMatch(serialized, /summary|strategy|screenshots|faq|quickAnswer|controls|mistakes/);
});

test("public catalog rejects duplicate or incomplete game identities", () => {
  assert.throws(
    () => createPublicGameCatalog({
      games: [games[0], { ...games[0] }],
      siteUrl: "https://gameguidebase.com",
      dataUpdatedAt: "2026-07-15",
      isPremium: () => false,
    }),
    /duplicate game slug/i,
  );
  assert.throws(
    () => createPublicGameCatalog({
      games: [{ ...games[0], title: "" }],
      siteUrl: "https://gameguidebase.com",
      dataUpdatedAt: "2026-07-15",
      isPremium: () => false,
    }),
    /title/i,
  );
});

test("schema and developer browser describe the same public contract", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "game-guide-public-catalog-"));
  const catalog = createPublicGameCatalog({
    games,
    siteUrl: "https://gameguidebase.com",
    apiBaseUrl: "https://game-guide-base.pages.dev",
    dataUpdatedAt: "2026-07-15",
    isPremium: () => false,
  });
  const schema = createPublicGameCatalogSchema({
    apiBaseUrl: "https://game-guide-base.pages.dev",
  });

  await writePublicGameCatalog({ root, catalog, schema });

  assert.equal(schema.$id, "https://game-guide-base.pages.dev/api/v1/games.schema.json");
  assert.ok(schema.required.includes("schemaUrl"));
  assert.equal(schema.required.includes("$schema"), false);
  assert.deepEqual(
    JSON.parse(await readFile(path.join(root, "api/v1/games.json"), "utf8")),
    catalog,
  );
  assert.deepEqual(
    JSON.parse(await readFile(path.join(root, "api/v1/games.schema.json"), "utf8")),
    schema,
  );

  const html = renderDeveloperCatalogBody(catalog);
  assert.match(html, /https:\/\/game-guide-base\.pages\.dev\/api\/v1\/games\.json/);
  assert.match(html, /https:\/\/game-guide-base\.pages\.dev\/api\/v1\/games\.schema\.json/);
  assert.match(html, /<h2>Copy-paste examples<\/h2>/);
  assert.match(html, /data-api-example="curl"/);
  assert.match(html, /curl -fsSL/);
  assert.match(html, /data-api-example="javascript"/);
  assert.match(html, /await fetch\(&quot;https:\/\/game-guide-base\.pages\.dev\/api\/v1\/games\.json&quot;\)/);
  assert.match(html, /data-api-example="python"/);
  assert.match(html, /from urllib\.request import urlopen/);
  assert.match(html, /catalog\[&quot;games&quot;\]\[:5\]/);
  assert.match(html, /78|2 games/);
  assert.match(html, /Beta &amp; Beyond/);
  assert.match(html, /Creator &lt;Two&gt;/);
  assert.doesNotMatch(html, /Paid strategy/);
});
