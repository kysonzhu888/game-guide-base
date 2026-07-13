import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildDeployPackage } from "./lib/deploy-package.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(root, argumentValue("--output") || ".deploy");
const result = await buildDeployPackage({ root, output });

console.log(JSON.stringify({
  ...result,
  megabytes: Number((result.bytes / 1024 / 1024).toFixed(2)),
}, null, 2));

function argumentValue(name) {
  const exactIndex = process.argv.indexOf(name);
  if (exactIndex !== -1) return process.argv[exactIndex + 1] || "";
  const prefixed = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : "";
}
