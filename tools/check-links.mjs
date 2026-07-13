import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const htmlFiles = collectHtmlFiles(root);
const missing = [];
let checked = 0;

for (const htmlFile of htmlFiles) {
  const html = fs.readFileSync(htmlFile, "utf8");
  const relativePagePath = path.relative(root, htmlFile).replace(/\/index\.html$/, "/");
  const pageUrl = new URL(relativePagePath, "https://local.gameguidebase.test/");

  for (const match of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)) {
    const rawTarget = match[1].trim();
    if (!rawTarget || rawTarget.startsWith("#") || rawTarget.startsWith("data:")) continue;

    let targetUrl;
    try {
      targetUrl = new URL(rawTarget, pageUrl);
    } catch {
      missing.push(`${path.relative(root, htmlFile)} -> invalid URL: ${rawTarget}`);
      continue;
    }

    if (targetUrl.origin !== pageUrl.origin || targetUrl.pathname.startsWith("/api/")) continue;

    checked += 1;
    const decodedPath = decodeURIComponent(targetUrl.pathname).replace(/^\/+/, "");
    const targetPath = path.join(root, decodedPath);
    const filePath = targetUrl.pathname.endsWith("/")
      ? path.join(targetPath, "index.html")
      : targetPath;
    if (!fs.existsSync(filePath)) {
      missing.push(`${path.relative(root, htmlFile)} -> ${targetUrl.pathname}`);
    }
  }
}

if (missing.length) {
  console.error(`Found ${missing.length} missing internal links:`);
  missing.slice(0, 100).forEach((item) => console.error(`- ${item}`));
  process.exitCode = 1;
} else {
  console.log(`Checked ${checked} internal links across ${htmlFiles.length} HTML files; none are missing.`);
}

function collectHtmlFiles(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if ([".deploy", ".git", ".media", "node_modules"].includes(entry.name)) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectHtmlFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      result.push(entryPath);
    }
  }
  return result;
}
