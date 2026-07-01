import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const config = readJson("site.config.json");
const games = readJson(path.join("data", "games.json"));
const media = readJson(path.join("data", "media.json"));

const site = {
  name: config.name,
  url: normalizeSiteUrl(config.siteUrl),
  description: config.description,
  contactEmail: config.contactEmail,
  googleAnalyticsId: (config.googleAnalyticsId || "").trim(),
  adsenseClientId: (config.adsenseClientId || "").trim(),
  adsensePublisherId: (config.adsensePublisherId || "").trim(),
  searchConsoleVerification: (config.searchConsoleVerification || "").trim(),
};

const genres = groupBy(games, (game) => game.genre);
const platforms = platformGroups(games);

cleanGenerated();
generateHomePage();
generateGamePages();
generateGenrePages();
generatePlatformPages();
generateUtilityPages();
generateSitemap();
generateRobots();
generateAdsTxt();

console.log(`Generated ${games.length} game guides, ${genres.size} genre pages, and ${platforms.length} platform pages for ${site.name}.`);

function cleanGenerated() {
  for (const dir of ["games", "genres", "platforms", "about", "contact", "privacy"]) {
    fs.rmSync(path.join(root, dir), { recursive: true, force: true });
  }
  for (const file of ["index.html", "robots.txt", "sitemap.xml", "ads.txt"]) {
    fs.rmSync(path.join(root, file), { force: true });
  }
}

function generateHomePage() {
  const featured = games.slice(0, 6);
  const popular = games.slice(0, 6);

  writePage([], layout({
    title: `${site.name}: Fast Game Guides, Rules, Tips, and FAQ`,
    description: site.description,
    path: "/",
    depth: 0,
    schema: [websiteSchema(), itemListSchema(games.slice(0, 12), "Popular game guides")],
    body: `
      <main>
        <section class="hero">
          <div class="hero-copy">
            <p class="kicker">Rules, routes, strategy, answers</p>
            <h1>Playable game walkthroughs, passcodes, and routes.</h1>
            <p class="hero-lede">We open web mini-games from Loopit, Sekai, Gizmo, and similar sites, play the route, capture the key screens, and write the passcodes, app notes, and practical tips players actually need.</p>
            <form class="search-panel" role="search" action="/" onsubmit="return false">
              <label for="guide-search">Find a game guide</label>
              <div class="search-row">
                <input id="guide-search" type="search" placeholder="Search passcode, Flappy, phone setup, platform..." autocomplete="off">
                <button type="button" data-clear-search>Clear</button>
              </div>
            </form>
          </div>
          <figure class="hero-media">
            <img src="${media.hero.url.replace(/^\//, "")}" alt="${escapeHtml(media.hero.alt)}">
            <figcaption>Original visual asset created for Game Guide Base.</figcaption>
          </figure>
        </section>

        <section class="section-head">
          <div>
              <p class="kicker">Start here</p>
              <h2>Latest walkthroughs</h2>
          </div>
          <a class="text-link" href="#all-guides">View guide library</a>
        </section>
        <section class="guide-grid" data-guide-list>
          ${popular.map((game) => guideCard(game, "")).join("")}
        </section>

        <section class="section-head">
          <div>
            <p class="kicker">Browse by platform</p>
            <h2>Source sites</h2>
          </div>
          <a class="text-link" href="platforms/">View platforms</a>
        </section>
        <section class="quick-nav" aria-label="Source sites">
          ${platforms.map((platform) => `
            <a class="genre-chip" href="platforms/${platform.slug}/">
              <span>${escapeHtml(platform.title)}</span>
              <strong>${platform.rows.length}</strong>
            </a>
          `).join("")}
        </section>

        <section class="section-head">
          <div>
            <p class="kicker">Browse by genre</p>
            <h2>Guide categories</h2>
          </div>
        </section>
        <section class="quick-nav" aria-label="Guide categories">
          ${Array.from(genres.entries()).map(([genre, rows]) => `
            <a class="genre-chip" href="genres/${slugify(genre)}/">
              <span>${escapeHtml(genre)}</span>
              <strong>${rows.length}</strong>
            </a>
          `).join("")}
        </section>

        <section class="answer-strip" aria-label="Site promise">
          <div>
            <h2>Built from hands-on playthroughs</h2>
            <p>Each guide starts from a real web link, then records the unlock path, screenshots, app routes, bugs, and mini-game tips that are visible during play.</p>
          </div>
          <ul>
            <li>Source link kept on the guide page</li>
            <li>FAQ schema for passcodes and app routes</li>
            <li>Screenshots used as walkthrough evidence</li>
          </ul>
        </section>

        <section class="section-head" id="all-guides">
          <div>
              <p class="kicker">Guide library</p>
              <h2>All guides</h2>
          </div>
        </section>
        <section class="guide-grid all-guides" data-guide-list>
          ${featured.concat(games.filter((game) => !featured.includes(game))).map((game) => guideCard(game, "")).join("")}
        </section>
      </main>
    `,
  }));
}

function generateGamePages() {
  for (const game of games) {
    const related = games
      .filter((candidate) => candidate.slug !== game.slug)
      .filter((candidate) => candidate.genre === game.genre || candidate.platforms.some((platform) => game.platforms.includes(platform)))
      .slice(0, 4);

    writePage(["games", game.slug], layout({
      title: `${game.title} Guide: Rules, Beginner Tips, Strategy, and FAQ`,
      description: `${game.quickAnswer} Learn ${game.title} rules, controls, strategy, common mistakes, and beginner tips.`,
      path: `/games/${game.slug}/`,
      depth: 2,
      schema: [gameSchema(game), faqSchema(game)],
      body: `
        <main class="article-page">
          ${breadcrumb("Games", "../../")}
          <section class="guide-hero">
            <div>
              <p class="kicker">${escapeHtml(game.genre)} guide</p>
              <h1>${escapeHtml(game.title)} guide</h1>
              <p>${escapeHtml(game.summary)}</p>
              ${game.sourceUrl ? `<a class="play-link" href="${escapeHtml(game.sourceUrl)}" target="_blank" rel="noopener">Play on ${escapeHtml(game.sourcePlatform || "source site")}</a>` : ""}
            </div>
            ${gameVisual(game, "game-hero-art")}
            <aside class="quick-answer">
              <span>Quick answer</span>
              <p>${escapeHtml(game.quickAnswer)}</p>
            </aside>
          </section>

          <section class="article-grid">
            <article class="article-main">
              ${guideSection("How to play", game.basics)}
              ${guideSection("Controls", game.controls)}
              ${guideSection("Strategy tips", game.strategy)}
              ${guideSection("Common mistakes", game.mistakes)}
              ${screenshotGallery(game)}
              <section class="faq-block">
                <h2>${escapeHtml(game.title)} FAQ</h2>
                ${game.faq.map(([question, answer]) => `
                  <details>
                    <summary>${escapeHtml(question)}</summary>
                    <p>${escapeHtml(answer)}</p>
                  </details>
                `).join("")}
              </section>
              ${commentSection(game)}
            </article>
            <aside class="article-aside">
              ${factsPanel(game)}
              ${adBox()}
            </aside>
          </section>

          ${related.length ? `<section class="section-head">
            <div>
              <p class="kicker">Next reads</p>
              <h2>Related guides</h2>
            </div>
          </section>
          ${relatedLinkList(related, "../../")}
          <section class="guide-grid related-guides">
            ${related.map((item) => guideCard(item, "../../")).join("")}
          </section>` : ""}
        </main>
      `,
    }));
  }
}

function generateGenrePages() {
  for (const [genre, rows] of genres.entries()) {
    writePage(["genres", slugify(genre)], layout({
      title: `${genre} Game Guides: Rules, Tips, and Strategy`,
      description: `Browse ${genre.toLowerCase()} game guides with rules, beginner tips, strategy notes, and FAQ answers.`,
      path: `/genres/${slugify(genre)}/`,
      depth: 2,
      schema: [itemListSchema(rows, `${genre} game guides`)],
      body: `
        <main class="article-page">
          ${breadcrumb("Genres", "../../")}
          <section class="guide-hero compact-hero">
            <div>
              <p class="kicker">Genre collection</p>
              <h1>${escapeHtml(genre)} game guides</h1>
              <p>Rules, beginner flow, controls, and practical strategy notes for ${escapeHtml(genre.toLowerCase())} games.</p>
            </div>
          </section>
          <section class="guide-grid">
            ${rows.map((game) => guideCard(game, "../../")).join("")}
          </section>
        </main>
      `,
    }));
  }
}

function generatePlatformPages() {
  writePage(["platforms"], layout({
    title: `Game Guide Platforms: Loopit, Sekai, Gizmo, and Web Playables`,
    description: `Browse walkthroughs by source site, including Loopit, Sekai, Gizmo, and similar web playable game platforms.`,
    path: "/platforms/",
    depth: 1,
    schema: [itemListSchema(games, "Game guides by platform")],
    body: `
      <main class="article-page">
        ${simpleBreadcrumb("Platforms", "../")}
        <section class="guide-hero compact-hero">
          <div>
            <p class="kicker">Source sites</p>
            <h1>Game guide platforms</h1>
            <p>Walkthroughs grouped by the web playable site where each game was found. This keeps Loopit-specific notes inside Loopit guides while leaving room for Sekai, Gizmo, and other sites.</p>
          </div>
        </section>
        <section class="quick-nav" aria-label="Source sites">
          ${platforms.map((platform) => `
            <a class="genre-chip" href="${platform.slug}/">
              <span>${escapeHtml(platform.title)}</span>
              <strong>${platform.rows.length}</strong>
            </a>
          `).join("")}
        </section>
      </main>
    `,
  }));

  for (const platform of platforms) {
    writePage(["platforms", platform.slug], layout({
      title: `${platform.title} Game Walkthroughs: Passcodes, Routes, and Tips`,
      description: `Browse ${platform.title} game walkthroughs with screenshots, passcodes, app routes, and practical beginner tips.`,
      path: `/platforms/${platform.slug}/`,
      depth: 2,
      schema: [itemListSchema(platform.rows, `${platform.title} game walkthroughs`)],
      body: `
        <main class="article-page">
          ${breadcrumb("Platforms", "../../")}
          <section class="guide-hero compact-hero">
            <div>
              <p class="kicker">Platform collection</p>
              <h1>${escapeHtml(platform.title)} game walkthroughs</h1>
              <p>Hands-on routes, screenshots, passcodes, and mini-game notes for games found on ${escapeHtml(platform.title)}.</p>
            </div>
          </section>
          <section class="guide-grid">
            ${platform.rows.map((game) => guideCard(game, "../../")).join("")}
          </section>
        </main>
      `,
    }));
  }
}

function generateUtilityPages() {
  writePage(["about"], layout({
    title: `About ${site.name}`,
    description: `${site.name} publishes fast, structured walkthroughs for web playable games across multiple source sites.`,
    path: "/about/",
    depth: 1,
    body: `
      <main class="article-page narrow-page">
        ${simpleBreadcrumb("About", "../")}
        <section class="text-page">
          <h1>About ${site.name}</h1>
          <p>${site.name} is a lightweight guide library for players who want the route, passcode, next move, or beginner strategy without digging through noisy pages.</p>
          <p>We cover web playable games from Loopit, Sekai, Gizmo, and similar platforms. Each source platform stays as article metadata, so the site can grow without being tied to one brand.</p>
          <p>We focus on original summaries, structured FAQ answers, and practical play advice. Screenshots are used as limited walkthrough evidence with source links on each guide page.</p>
        </section>
      </main>
    `,
  }));

  writePage(["contact"], layout({
    title: `Contact ${site.name}`,
    description: `Contact ${site.name} for corrections, suggestions, and guide requests.`,
    path: "/contact/",
    depth: 1,
    body: `
      <main class="article-page narrow-page">
        ${simpleBreadcrumb("Contact", "../")}
        <section class="text-page">
          <h1>Contact</h1>
          <p>For corrections, guide requests, or site questions, email <a href="mailto:${site.contactEmail}">${site.contactEmail}</a>.</p>
          <p>Please include the guide URL and a short explanation if you are reporting an error.</p>
        </section>
      </main>
    `,
  }));

  writePage(["privacy"], layout({
    title: `Privacy Policy`,
    description: `Privacy policy for ${site.name}.`,
    path: "/privacy/",
    depth: 1,
    body: `
      <main class="article-page narrow-page">
        ${simpleBreadcrumb("Privacy", "../")}
        <section class="text-page">
          <h1>Privacy Policy</h1>
          <p>${site.name} is a static content site. We may use analytics and advertising services to understand traffic and support the site.</p>
          <p>Those services may use cookies or similar technologies according to their own policies. You can control cookies through your browser settings.</p>
          <p>We do not ask visitors to create accounts or submit personal gameplay data.</p>
        </section>
      </main>
    `,
  }));
}

function layout({ title, description, body, depth, path: pagePath, schema = [] }) {
  const prefix = depthPrefix(depth);
  const canonical = `${site.url}${pagePath === "/" ? "/" : pagePath}`;
  const schemaTags = schema.filter(Boolean).map((item) => `
    <script type="application/ld+json">${JSON.stringify(item)}</script>
  `).join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${site.url}/assets/hero-game-guides.png">
  ${site.searchConsoleVerification ? `<meta name="google-site-verification" content="${escapeHtml(site.searchConsoleVerification)}">` : ""}
  ${site.googleAnalyticsId ? analyticsTag(site.googleAnalyticsId) : ""}
  ${site.adsenseClientId ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${escapeHtml(site.adsenseClientId)}" crossorigin="anonymous"></script>` : ""}
  <link rel="stylesheet" href="${prefix}styles.css">
  ${schemaTags}
</head>
<body>
  <header class="site-header">
    <a class="brand" href="${prefix}"><span class="brand-mark">G</span><span>${site.name}</span></a>
    <nav aria-label="Primary navigation">
      <a href="${prefix}#all-guides">Guides</a>
      <a href="${prefix}platforms/">Platforms</a>
      <a href="${prefix}about/">About</a>
    </nav>
  </header>
  ${body}
  <footer class="site-footer">
    <div>
      <strong>${site.name}</strong>
      <p>Fast routes, passcodes, and beginner tips for web playable games.</p>
    </div>
    <nav aria-label="Footer navigation">
      <a href="${prefix}about/">About</a>
      <a href="${prefix}contact/">Contact</a>
      <a href="${prefix}privacy/">Privacy</a>
      <a href="${prefix}sitemap.xml">Sitemap</a>
    </nav>
  </footer>
  <script src="${prefix}script.js" defer></script>
</body>
</html>`;
}

function guideSection(title, items) {
  return `
    <section class="guide-section">
      <h2>${escapeHtml(title)}</h2>
      <ul>
        ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </section>
  `;
}

function guideCard(game, prefix) {
  return `
    <article class="guide-card" data-guide-card data-title="${escapeHtml(game.title.toLowerCase())}" data-genre="${escapeHtml(game.genre.toLowerCase())}" data-platform="${escapeHtml(String(game.sourcePlatform || "").toLowerCase())}">
      <a href="${prefix}games/${game.slug}/" aria-label="${escapeHtml(game.title)} guide">
        ${gameVisual(game, "card-art", prefix)}
        <span class="card-genre">${escapeHtml(game.genre)}</span>
        <h3>${escapeHtml(game.title)}</h3>
        <p>${escapeHtml(game.quickAnswer)}</p>
        <div class="card-meta">
          <span>${escapeHtml(game.difficulty)}</span>
          <span>${game.platforms.map(escapeHtml).join(" / ")}</span>
        </div>
        <span class="read-guide">Read guide</span>
      </a>
    </article>
  `;
}

function screenshotGallery(game) {
  if (!Array.isArray(game.screenshots) || !game.screenshots.length) return "";
  return `
    <section class="screenshot-gallery">
      <h2>Walkthrough screenshots</h2>
      <div class="screenshot-grid">
        ${game.screenshots.map((shot) => `
          <figure>
            <img src="../..${shot.src}" alt="${escapeHtml(shot.alt)}" loading="lazy">
            <figcaption>${escapeHtml(shot.caption)}</figcaption>
          </figure>
        `).join("")}
      </div>
    </section>
  `;
}

function relatedLinkList(related, prefix) {
  return `
    <nav class="related-link-list" aria-label="Related guide links">
      ${related.map((game) => `<a href="${prefix}games/${game.slug}/">${escapeHtml(game.title)} guide</a>`).join("")}
    </nav>
  `;
}

function gameVisual(game, className, prefix = "") {
  const firstShot = Array.isArray(game.screenshots) ? game.screenshots[0] : null;
  if (firstShot) {
    return `
      <figure class="${className}" aria-label="${escapeHtml(game.title)} walkthrough screenshot">
        <img src="${imageSrcForClass(firstShot.src, className, prefix)}" alt="${escapeHtml(firstShot.alt)}" loading="lazy">
      </figure>
    `;
  }
  const palette = visualPalette(game.slug);
  const pattern = visualPattern(game.slug, palette);
  return `
    <figure class="${className}" aria-label="${escapeHtml(game.title)} visual guide thumbnail">
      <svg viewBox="0 0 320 200" role="img" aria-labelledby="${game.slug}-visual-title" xmlns="http://www.w3.org/2000/svg">
        <title id="${game.slug}-visual-title">${escapeHtml(game.title)} guide visual</title>
        <defs>
          <linearGradient id="${game.slug}-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="${palette.bg1}"/>
            <stop offset="1" stop-color="${palette.bg2}"/>
          </linearGradient>
        </defs>
        <rect width="320" height="200" rx="18" fill="url(#${game.slug}-bg)"/>
        ${pattern}
        <rect x="18" y="18" width="92" height="28" rx="14" fill="rgba(255,255,255,0.82)"/>
        <text x="64" y="37" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="800" fill="${palette.ink}">${escapeHtml(game.genre)}</text>
      </svg>
    </figure>
  `;
}

function imageSrcForClass(src, className, prefix) {
  if (className === "card-art") return `${prefix}${src.replace(/^\//, "")}`;
  if (className === "game-hero-art") return `../..${src}`;
  return src;
}

function visualPalette(slug) {
  const palettes = [
    { bg1: "#e9f6ef", bg2: "#c7e8d8", ink: "#123528", accent: "#0b7a53", warm: "#e7a332", cool: "#2377b9" },
    { bg1: "#fff4df", bg2: "#ffd7b4", ink: "#422b16", accent: "#d99628", warm: "#e96443", cool: "#0b7a53" },
    { bg1: "#edf4ff", bg2: "#c8dcfb", ink: "#182c43", accent: "#2377b9", warm: "#e7a332", cool: "#0b7a53" },
    { bg1: "#f4efe8", bg2: "#d7eadb", ink: "#253325", accent: "#698c42", warm: "#d99628", cool: "#2377b9" },
  ];
  const index = [...slug].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palettes.length;
  return palettes[index];
}

function visualPattern(slug, palette) {
  switch (slug) {
    case "2048":
      return tileGrid(["2", "4", "8", "16", "32", "64", "128", "2048"], palette);
    case "wordle":
      return wordGrid(["W", "O", "R", "D", "S"], ["#0b7a53", "#d99628", "#8a928d"], palette);
    case "connections":
      return connectionBubbles(["CAT", "HAT", "MAP", "PIN", "RED", "BLUE", "FAST", "SLOW"], palette);
    case "little-alchemy-2":
    case "infinite-craft":
      return craftNodes(palette);
    case "suika-game":
      return fruitStack(palette);
    case "among-us":
      return socialMap(palette);
    case "cookie-clicker":
      return cookieScene(palette);
    case "subway-surfers":
      return runnerTracks(palette);
    case "minecraft-survival":
    case "terraria":
      return blockWorld(palette);
    case "stardew-valley":
      return farmRows(palette);
    case "geometry-dash":
      return spikeCourse(palette);
    case "slope":
      return slopeRun(palette);
    case "fireboy-and-watergirl":
      return duoPuzzle(palette);
    case "papa-freezeria":
      return sundaeStation(palette);
    case "bitlife":
      return lifeTimeline(palette);
    case "monopoly-go":
      return boardLoop(palette);
    case "blox-fruits":
      return islandQuest(palette);
    case "roblox-obby":
      return obbyPlatforms(palette);
    case "tetris":
      return tetrominoStack(palette);
    default:
      return abstractGuide(palette);
  }
}

function tileGrid(values, palette) {
  return values.map((value, index) => {
    const x = 74 + (index % 4) * 44;
    const y = 62 + Math.floor(index / 4) * 44;
    return `<rect x="${x}" y="${y}" width="38" height="38" rx="8" fill="${index === values.length - 1 ? palette.accent : "rgba(255,255,255,0.78)"}"/><text x="${x + 19}" y="${y + 24}" text-anchor="middle" font-family="Inter, Arial" font-size="${value.length > 3 ? 11 : 15}" font-weight="900" fill="${index === values.length - 1 ? "#fff" : palette.ink}">${value}</text>`;
  }).join("");
}

function wordGrid(letters, colors, palette) {
  return letters.map((letter, index) => {
    const x = 58 + index * 42;
    const color = colors[index % colors.length];
    return `<rect x="${x}" y="78" width="36" height="36" rx="5" fill="${color}"/><text x="${x + 18}" y="102" text-anchor="middle" font-family="Inter, Arial" font-size="18" font-weight="900" fill="#fff">${letter}</text>`;
  }).join("") + `<path d="M74 138h170" stroke="${palette.ink}" stroke-width="8" stroke-linecap="round" opacity=".18"/>`;
}

function connectionBubbles(words, palette) {
  return words.map((word, index) => {
    const x = 48 + (index % 4) * 58;
    const y = 70 + Math.floor(index / 4) * 48;
    return `<rect x="${x}" y="${y}" width="50" height="34" rx="17" fill="rgba(255,255,255,0.82)"/><text x="${x + 25}" y="${y + 22}" text-anchor="middle" font-family="Inter, Arial" font-size="10" font-weight="900" fill="${palette.ink}">${word}</text>`;
  }).join("") + `<path d="M72 87c34 44 116 44 174 0" fill="none" stroke="${palette.accent}" stroke-width="4" stroke-linecap="round" opacity=".55"/>`;
}

function craftNodes(palette) {
  return `<circle cx="83" cy="94" r="25" fill="${palette.cool}"/><circle cx="160" cy="64" r="25" fill="${palette.warm}"/><circle cx="222" cy="122" r="25" fill="${palette.accent}"/><path d="M105 87l32-13M178 80l25 24M106 104l91 21" stroke="${palette.ink}" stroke-width="5" stroke-linecap="round" opacity=".34"/><text x="83" y="100" text-anchor="middle" font-family="Inter, Arial" font-size="18" font-weight="900" fill="#fff">A</text><text x="160" y="70" text-anchor="middle" font-family="Inter, Arial" font-size="18" font-weight="900" fill="#fff">B</text><text x="222" y="128" text-anchor="middle" font-family="Inter, Arial" font-size="18" font-weight="900" fill="#fff">C</text>`;
}

function fruitStack(palette) {
  return `<rect x="82" y="58" width="156" height="96" rx="14" fill="rgba(255,255,255,.45)" stroke="${palette.ink}" stroke-width="4" opacity=".8"/><circle cx="126" cy="128" r="22" fill="#6dbb47"/><circle cx="164" cy="124" r="28" fill="#f6c34d"/><circle cx="202" cy="116" r="34" fill="#e96443"/><circle cx="154" cy="88" r="17" fill="#8fcf65"/><circle cx="186" cy="78" r="20" fill="#ffd66b"/>`;
}

function socialMap(palette) {
  return `<rect x="74" y="54" width="172" height="108" rx="16" fill="rgba(255,255,255,.55)"/><circle cx="116" cy="96" r="22" fill="${palette.accent}"/><circle cx="202" cy="96" r="22" fill="${palette.warm}"/><circle cx="160" cy="128" r="22" fill="${palette.cool}"/><path d="M136 101h44M128 111l20 14M192 112l-20 14" stroke="${palette.ink}" stroke-width="5" stroke-linecap="round" opacity=".42"/><rect x="104" y="84" width="24" height="16" rx="7" fill="#fff" opacity=".8"/><rect x="190" y="84" width="24" height="16" rx="7" fill="#fff" opacity=".8"/>`;
}

function cookieScene(palette) {
  return `<circle cx="160" cy="102" r="52" fill="#c78642"/><circle cx="138" cy="88" r="6" fill="#5c3318"/><circle cx="177" cy="76" r="7" fill="#5c3318"/><circle cx="185" cy="121" r="6" fill="#5c3318"/><circle cx="147" cy="128" r="5" fill="#5c3318"/><path d="M68 150h184" stroke="${palette.ink}" stroke-width="10" stroke-linecap="round" opacity=".16"/>`;
}

function runnerTracks(palette) {
  return `<path d="M92 158L142 54M160 158V54M228 158L178 54" stroke="${palette.ink}" stroke-width="8" stroke-linecap="round" opacity=".24"/><path d="M74 126h172M92 92h136M112 66h96" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity=".86"/><circle cx="162" cy="108" r="18" fill="${palette.warm}"/><path d="M162 91v34" stroke="${palette.ink}" stroke-width="5" stroke-linecap="round" opacity=".45"/>`;
}

function blockWorld(palette) {
  return `<rect x="72" y="112" width="44" height="44" fill="${palette.accent}"/><rect x="116" y="112" width="44" height="44" fill="#7a5a3a"/><rect x="160" y="112" width="44" height="44" fill="${palette.accent}"/><rect x="204" y="112" width="44" height="44" fill="#7a5a3a"/><rect x="116" y="68" width="44" height="44" fill="${palette.cool}"/><rect x="160" y="68" width="44" height="44" fill="#f0d78a"/><path d="M66 156h188" stroke="${palette.ink}" stroke-width="8" stroke-linecap="round" opacity=".18"/>`;
}

function farmRows(palette) {
  return `<path d="M70 144c46-24 134-24 180 0" fill="none" stroke="#8d6a3f" stroke-width="13" stroke-linecap="round"/><path d="M82 118c38-20 118-20 156 0M96 94c30-15 88-15 118 0" fill="none" stroke="#8d6a3f" stroke-width="10" stroke-linecap="round"/><circle cx="116" cy="112" r="9" fill="${palette.accent}"/><circle cx="166" cy="100" r="9" fill="${palette.accent}"/><circle cx="210" cy="119" r="9" fill="${palette.accent}"/><circle cx="147" cy="139" r="9" fill="${palette.warm}"/>`;
}

function spikeCourse(palette) {
  return `<rect x="74" y="132" width="172" height="12" rx="6" fill="${palette.ink}" opacity=".24"/><rect x="84" y="94" width="32" height="32" rx="4" fill="${palette.accent}" transform="rotate(8 100 110)"/><path d="M132 132l18-34 18 34M176 132l18-34 18 34" fill="${palette.warm}"/><circle cx="238" cy="88" r="16" fill="${palette.cool}"/><path d="M108 78c38-26 88-22 122 0" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".8"/>`;
}

function slopeRun(palette) {
  return `<path d="M82 150L160 54L238 150Z" fill="rgba(255,255,255,.62)"/><path d="M160 54v96" stroke="${palette.ink}" stroke-width="5" opacity=".28"/><circle cx="176" cy="96" r="18" fill="${palette.accent}"/><path d="M102 150h116" stroke="${palette.ink}" stroke-width="7" stroke-linecap="round" opacity=".25"/>`;
}

function duoPuzzle(palette) {
  return `<circle cx="116" cy="98" r="30" fill="#e96443"/><circle cx="204" cy="98" r="30" fill="#2377b9"/><rect x="74" y="138" width="172" height="16" rx="8" fill="rgba(255,255,255,.75)"/><path d="M116 128v22M204 128v22M146 98h28" stroke="${palette.ink}" stroke-width="7" stroke-linecap="round" opacity=".34"/><circle cx="116" cy="88" r="8" fill="#fff"/><circle cx="204" cy="88" r="8" fill="#fff"/>`;
}

function sundaeStation(palette) {
  return `<path d="M114 80h92l-16 74h-60z" fill="rgba(255,255,255,.8)" stroke="${palette.ink}" stroke-width="4" opacity=".74"/><path d="M126 80c8-24 60-24 68 0" fill="#fff"/><circle cx="144" cy="76" r="12" fill="${palette.warm}"/><circle cx="170" cy="70" r="13" fill="${palette.accent}"/><circle cx="188" cy="80" r="10" fill="${palette.cool}"/><path d="M132 116h56" stroke="${palette.warm}" stroke-width="8" stroke-linecap="round"/>`;
}

function lifeTimeline(palette) {
  return `<path d="M74 110h172" stroke="${palette.ink}" stroke-width="7" stroke-linecap="round" opacity=".25"/><circle cx="96" cy="110" r="18" fill="${palette.accent}"/><circle cx="142" cy="110" r="18" fill="${palette.warm}"/><circle cx="188" cy="110" r="18" fill="${palette.cool}"/><circle cx="234" cy="110" r="18" fill="#fff"/><path d="M96 88v-20M188 132v22M234 88v-18" stroke="${palette.ink}" stroke-width="5" stroke-linecap="round" opacity=".26"/>`;
}

function boardLoop(palette) {
  return `<rect x="86" y="58" width="148" height="104" rx="18" fill="rgba(255,255,255,.68)" stroke="${palette.ink}" stroke-width="5" opacity=".72"/><rect x="104" y="76" width="32" height="28" rx="7" fill="${palette.accent}"/><rect x="184" y="76" width="32" height="28" rx="7" fill="${palette.warm}"/><rect x="104" y="118" width="32" height="28" rx="7" fill="${palette.cool}"/><rect x="184" y="118" width="32" height="28" rx="7" fill="#fff"/><circle cx="160" cy="112" r="15" fill="${palette.ink}" opacity=".5"/>`;
}

function islandQuest(palette) {
  return `<path d="M80 132c34-42 112-42 160 0c-36 23-122 23-160 0z" fill="${palette.accent}"/><path d="M106 128c20-18 76-23 108-2" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".68"/><circle cx="162" cy="76" r="24" fill="${palette.warm}"/><path d="M162 100v30M142 116h40" stroke="${palette.ink}" stroke-width="6" stroke-linecap="round" opacity=".34"/>`;
}

function obbyPlatforms(palette) {
  return `<rect x="68" y="134" width="58" height="18" rx="7" fill="${palette.accent}"/><rect x="142" y="108" width="58" height="18" rx="7" fill="${palette.warm}"/><rect x="216" y="82" width="58" height="18" rx="7" fill="${palette.cool}"/><path d="M126 134c20-30 34-28 48-26M200 108c20-30 34-28 48-26" fill="none" stroke="${palette.ink}" stroke-width="5" stroke-linecap="round" opacity=".3"/><circle cx="104" cy="104" r="14" fill="#fff"/>`;
}

function tetrominoStack(palette) {
  const blocks = [[96,120,palette.accent],[132,120,palette.accent],[168,120,palette.warm],[204,120,palette.warm],[132,84,palette.cool],[168,84,palette.cool],[168,48,palette.cool],[204,84,"#fff"]];
  return blocks.map(([x, y, color]) => `<rect x="${x}" y="${y}" width="32" height="32" rx="5" fill="${color}" stroke="${palette.ink}" stroke-width="3" opacity=".88"/>`).join("");
}

function abstractGuide(palette) {
  return `<path d="M72 132c42-50 104-50 176 0" fill="none" stroke="${palette.ink}" stroke-width="8" stroke-linecap="round" opacity=".2"/><circle cx="96" cy="124" r="18" fill="${palette.accent}"/><circle cx="160" cy="86" r="22" fill="${palette.warm}"/><circle cx="224" cy="124" r="18" fill="${palette.cool}"/>`;
}

function factsPanel(game) {
  return `
    <section class="facts-panel">
      <h2>Guide facts</h2>
      <dl>
        ${game.sourcePlatform ? `<div><dt>Source site</dt><dd>${escapeHtml(game.sourcePlatform)}</dd></div>` : ""}
        <div><dt>Genre</dt><dd>${escapeHtml(game.genre)}</dd></div>
        <div><dt>Platforms</dt><dd>${game.platforms.map(escapeHtml).join(", ")}</dd></div>
        <div><dt>Difficulty</dt><dd>${escapeHtml(game.difficulty)}</dd></div>
        ${game.creator ? `<div><dt>Creator</dt><dd>${escapeHtml(game.creator)}</dd></div>` : ""}
        ${game.stats?.views ? `<div><dt>Views</dt><dd>${escapeHtml(game.stats.views)}</dd></div>` : ""}
        ${game.stats?.likes ? `<div><dt>Likes</dt><dd>${escapeHtml(game.stats.likes)}</dd></div>` : ""}
        ${game.stats?.comments ? `<div><dt>Comments</dt><dd>${escapeHtml(game.stats.comments)}</dd></div>` : ""}
        ${game.stats?.remixes ? `<div><dt>Remixes</dt><dd>${escapeHtml(game.stats.remixes)}</dd></div>` : ""}
        <div><dt>Search intent</dt><dd>${escapeHtml(game.searchIntent)}</dd></div>
      </dl>
      ${game.sourceUrl ? `<a class="source-link" href="${escapeHtml(game.sourceUrl)}" target="_blank" rel="noopener">Open source playable</a>` : ""}
    </section>
  `;
}

function commentSection(game) {
  return `
    <section class="comment-section" data-comment-section data-game-slug="${escapeHtml(game.slug)}">
      <div class="comment-head">
        <div>
          <p class="kicker">Player notes</p>
          <h2>Player comments</h2>
        </div>
        <span data-comment-count>Loading comments</span>
      </div>
      <form class="comment-form" data-comment-form>
        <div class="comment-fields">
          <label>
            <span>Name</span>
            <input name="name" type="text" maxlength="40" placeholder="Player" autocomplete="name">
          </label>
          <label>
            <span>Comment</span>
            <textarea name="comment" maxlength="600" rows="3" placeholder="Share a tip, correction, or question..." required></textarea>
          </label>
        </div>
        <div class="comment-actions">
          <p class="comment-status" data-comment-status role="status"></p>
          <button type="submit" data-comment-submit>Post</button>
        </div>
      </form>
      <div class="comment-list" data-comment-list></div>
    </section>
  `;
}

function adBox() {
  return `
    <section class="ad-box" aria-label="Related guides">
      <span>Keep exploring</span>
      <p>Use related guides to compare rules, controls, and beginner strategy across similar games.</p>
    </section>
  `;
}

function breadcrumb(label, prefix) {
  return `
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="${prefix}">Home</a>
      <span>/</span>
      <span>${escapeHtml(label)}</span>
    </nav>
  `;
}

function simpleBreadcrumb(label, prefix) {
  return breadcrumb(label, prefix);
}

function writePage(parts, html) {
  const dir = path.join(root, ...parts);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html);
}

function generateSitemap() {
  const urls = [
    "/",
    "/about/",
    "/contact/",
    "/privacy/",
    "/platforms/",
    ...platforms.map((platform) => `/platforms/${platform.slug}/`),
    ...Array.from(genres.keys()).map((genre) => `/genres/${slugify(genre)}/`),
    ...games.map((game) => `/games/${game.slug}/`),
  ];
  fs.writeFileSync(path.join(root, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${site.url}${url}</loc><changefreq>${url === "/" ? "daily" : "weekly"}</changefreq><priority>${url === "/" ? "1.0" : "0.7"}</priority></url>`).join("\n")}
</urlset>
`);
}

function generateRobots() {
  fs.writeFileSync(path.join(root, "robots.txt"), `User-agent: *
Allow: /

Sitemap: ${site.url}/sitemap.xml
`);
}

function generateAdsTxt() {
  const publisher = site.adsensePublisherId.replace(/^pub-/, "");
  fs.writeFileSync(path.join(root, "ads.txt"), publisher ? `google.com, pub-${publisher}, DIRECT, f08c47fec0942fa0\n` : "");
}

function gameSchema(game) {
  return {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: game.title,
    description: game.summary,
    genre: game.genre,
    gamePlatform: game.platforms,
    url: `${site.url}/games/${game.slug}/`,
    publisher: {
      "@type": "Organization",
      name: site.name,
    },
  };
}

function faqSchema(game) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: game.faq.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: {
        "@type": "Answer",
        text: answer,
      },
    })),
  };
}

function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: site.name,
    url: site.url,
    description: site.description,
    potentialAction: {
      "@type": "SearchAction",
      target: `${site.url}/?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

function itemListSchema(rows, name) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    itemListElement: rows.map((game, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${site.url}/games/${game.slug}/`,
      name: game.title,
    })),
  };
}

function analyticsTag(id) {
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${escapeHtml(id)}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${escapeHtml(id)}');
  </script>`;
}

function depthPrefix(depth) {
  if (depth === 0) return "";
  return "../".repeat(depth);
}

function normalizeSiteUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

function groupBy(rows, getKey) {
  const result = new Map();
  for (const row of rows) {
    const key = getKey(row);
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(row);
  }
  return new Map([...result.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

function platformGroups(rows) {
  const bySlug = new Map();
  for (const game of rows) {
    const title = game.sourcePlatform || "Other";
    const slug = game.sourcePlatformSlug || slugify(title);
    if (!bySlug.has(slug)) {
      bySlug.set(slug, { slug, title, rows: [] });
    }
    bySlug.get(slug).rows.push(game);
  }
  return Array.from(bySlug.values()).sort((a, b) => a.title.localeCompare(b.title));
}

function slugify(value) {
  return String(value).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}
