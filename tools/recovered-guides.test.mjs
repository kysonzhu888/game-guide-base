import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const recoveredGuides = new Map([
  ["loopit-ethereal-gesture-maze", "https://share.loopit.me/game/82cd848c-5725-4f4b-ac77-7bdaee3fcd9c"],
  ["loopit-ink-alive", "https://share.loopit.me/game/e0ab60a9-5e2d-471e-9767-a0dead218190"],
  ["loopit-love-is-love", "https://share.loopit.me/game/9e9fa910-c265-4702-8bfa-83784ee1c5ce"],
  ["loopit-not-only-variable", "https://share.loopit.me/game/5c582784-0c57-4356-b6e1-57bf10c24354"],
  ["loopit-winners-pages-four-five", "https://share.loopit.me/game/f79d3edc-d4e0-4e2f-9221-ad37c23d5d0b"],
]);

test("keeps the five recovered production guides in canonical source", async () => {
  const games = await readJson("../data/games.json");
  const mediaManifest = await readJson("../data/media-assets.generated.json");
  const gameBySlug = new Map(games.map((game) => [game.slug, game]));

  assert.equal(games.length, 68);
  assert.equal(gameBySlug.size, games.length, "guide slugs must remain unique");

  for (const [slug, sourceUrl] of recoveredGuides) {
    const game = gameBySlug.get(slug);
    assert.ok(game, `missing recovered guide: ${slug}`);
    assert.equal(game.sourceUrl, sourceUrl);
    assert.equal(game.sourcePlatformSlug, "loopit");
    assert.equal(game.screenshots.length, 2);

    for (const screenshot of game.screenshots) {
      assert.ok(mediaManifest[screenshot.src], `missing media manifest entry: ${screenshot.src}`);
      await access(new URL(`..${screenshot.src}`, import.meta.url));
    }
  }
});

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8"));
}
