import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const output = path.resolve("viewer-dist");
const required = ["index.html", "graph.json", "okf-graph.json"];
for (const file of required) {
  if (!existsSync(path.join(output, file))) throw new Error(`Static demo is missing ${file}`);
}

const html = readFileSync(path.join(output, "index.html"), "utf8");
if (!html.includes("<html lang=\"en\">")) throw new Error("Static demo language metadata is missing");
if (!html.includes("rel=\"canonical\"")) throw new Error("Static demo canonical URL is missing");
if (!html.includes("property=\"og:title\"")) throw new Error("Static demo social metadata is missing");
if (/\b(?:src|href)=\"\/assets\//.test(html)) throw new Error("Static demo uses root-absolute assets and will break on project Pages");

console.log("Static demo is portable: metadata, graph fixtures, and relative assets passed");
