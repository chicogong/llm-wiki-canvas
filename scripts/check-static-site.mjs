import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const output = path.resolve("viewer-dist");
const required = ["index.html", "graph.json", "agent-trends-zh.json", "okf-graph.json", "demo-drafts.json", "demo-proposals.json", "demo-drafts-zh.json", "demo-proposals-zh.json", "social-preview.png"];
for (const file of required) {
  if (!existsSync(path.join(output, file))) throw new Error(`Static demo is missing ${file}`);
}

const html = readFileSync(path.join(output, "index.html"), "utf8");
if (!html.includes("<html lang=\"en\">")) throw new Error("Static demo language metadata is missing");
if (!html.includes("rel=\"canonical\"")) throw new Error("Static demo canonical URL is missing");
if (!html.includes("property=\"og:title\"")) throw new Error("Static demo social metadata is missing");
if (!html.includes("Git-style Proposal review layer")) throw new Error("Static demo metadata does not express the Proposal review-layer positioning");
if (/\b(?:src|href)=\"\/assets\//.test(html)) throw new Error("Static demo uses root-absolute assets and will break on project Pages");

const demoDrafts = JSON.parse(readFileSync(path.join(output, "demo-drafts.json"), "utf8"));
const demoProposals = JSON.parse(readFileSync(path.join(output, "demo-proposals.json"), "utf8"));
const demoDraftsZh = JSON.parse(readFileSync(path.join(output, "demo-drafts-zh.json"), "utf8"));
const demoProposalsZh = JSON.parse(readFileSync(path.join(output, "demo-proposals-zh.json"), "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
function assertDemoEvidence(drafts, proposals, label) {
  if (drafts.drafts?.length !== 1 || proposals.proposals?.length !== 1) throw new Error(`${label} static demo must contain one draft and one proposal`);
  const draft = drafts.drafts[0];
  const proposal = proposals.proposals[0];
  if (draft.source.path.startsWith("/") || draft.file.startsWith("/")) throw new Error(`${label} static draft paths must be sanitized and relative`);
  if (proposal.status !== "proposed" || proposal.file.startsWith("/")) throw new Error(`${label} static proposal must be unreviewed and relative`);
  if (sha256(draft.source.snapshotContent) !== draft.source.sha256 || Buffer.byteLength(draft.source.snapshotContent) !== draft.source.bytes) throw new Error(`${label} static source evidence hash is invalid`);
  if (sha256(draft.draft.content) !== draft.draft.currentHash) throw new Error(`${label} static draft evidence hash is invalid`);
  const proposedContent = proposal.changes[0].diff.filter((line) => line.kind === "add").map((line) => line.text).join("\n");
  if (sha256(proposedContent) !== proposal.changes[0].contentHash) throw new Error(`${label} static proposal evidence hash is invalid`);
}
assertDemoEvidence(demoDrafts, demoProposals, "English");
assertDemoEvidence(demoDraftsZh, demoProposalsZh, "Chinese");
if (!demoDraftsZh.drafts[0].source.name.includes("模拟") || !demoProposalsZh.proposals[0].summary.includes("审查")) throw new Error("Chinese static review evidence must be localized");

console.log("Static demo is portable: metadata, graph fixtures, and relative assets passed");
