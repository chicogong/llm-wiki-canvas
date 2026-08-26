import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const output = path.resolve("viewer-dist");
const required = ["index.html", "graph.json", "agent-trends-zh.json", "okf-graph.json", "demo-drafts.json", "demo-proposals.json", "social-preview.png"];
for (const file of required) {
  if (!existsSync(path.join(output, file))) throw new Error(`Static demo is missing ${file}`);
}

const html = readFileSync(path.join(output, "index.html"), "utf8");
if (!html.includes("<html lang=\"en\">")) throw new Error("Static demo language metadata is missing");
if (!html.includes("rel=\"canonical\"")) throw new Error("Static demo canonical URL is missing");
if (!html.includes("property=\"og:title\"")) throw new Error("Static demo social metadata is missing");
if (!html.includes("Git-style review flow")) throw new Error("Static demo metadata does not express the knowledge change-review positioning");
if (/\b(?:src|href)=\"\/assets\//.test(html)) throw new Error("Static demo uses root-absolute assets and will break on project Pages");

const demoDrafts = JSON.parse(readFileSync(path.join(output, "demo-drafts.json"), "utf8"));
const demoProposals = JSON.parse(readFileSync(path.join(output, "demo-proposals.json"), "utf8"));
if (demoDrafts.drafts?.length !== 1 || demoDrafts.drafts[0].source.path.startsWith("/")) throw new Error("Static draft demo must contain one sanitized relative-path fixture");
if (demoProposals.proposals?.length !== 1 || demoProposals.proposals[0].status !== "proposed") throw new Error("Static proposal demo must contain one unreviewed proposal");

console.log("Static demo is portable: metadata, graph fixtures, and relative assets passed");
