import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const notFound = fs.readFileSync(path.join(root, "404.html"), "utf8");

assert.match(notFound, /<meta name="robots" content="noindex,follow">/);
assert.doesNotMatch(notFound, /<link rel="canonical"/);

console.log("static output SEO tests passed");
