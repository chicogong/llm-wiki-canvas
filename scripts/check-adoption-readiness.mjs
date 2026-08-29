import { readFileSync } from "node:fs";

const targetDate = "2026-08-29";
const ledgerPath = process.env.LWC_ADOPTION_LEDGER || "docs/adoption-ledger.csv";
const fixtureManifest = readFileSync("examples/host-fixture/fixture.sha256", "utf8");
const fixtureHash = fixtureManifest.match(/^aggregate\s+([a-f0-9]{64})$/m)?.[1];
if (!fixtureHash) throw new Error("Adoption fixture manifest is missing its aggregate SHA-256");

function requirePhrases(file, phrases) {
  const content = readFileSync(file, "utf8");
  for (const phrase of phrases) {
    if (!content.includes(phrase)) throw new Error(`${file} is missing the positioning phrase: ${phrase}`);
  }
  return content;
}

requirePhrases("README.md", [
  "A Git-style Proposal review layer before AI Agents change Markdown knowledge",
  "source SHA-256",
  "Evidence Ledger",
  "exact diffs",
  "explicit omission disclosure",
  "stale-base blocking",
  "human accept/reject",
]);
requirePhrases("README.zh-CN.md", [
  "Agent 修改 Markdown 知识前的 Git 式 Proposal 审查层",
  "来源 SHA-256",
  "证据账本",
  "精确 diff",
  "遗漏披露",
  "过期基线阻断",
  "接受或拒绝",
]);
requirePhrases("ROADMAP.md", [
  "Git-style Proposal review layer before AI Agents change Markdown knowledge",
  "Evidence Ledger",
  "omission disclosure",
  "stale-base blocking",
  "human acceptance or rejection",
  "Agent 修改 Markdown 知识前的 Git 式 Proposal 审查层",
]);
requirePhrases("package.json", [
  "A Git-style Proposal review layer before AI Agents change Markdown knowledge",
]);
requirePhrases("index.html", [
  "A Git-style Proposal review layer before AI Agents change Markdown knowledge",
  "Evidence Ledger",
  "stale-base blocking",
  "human accept or reject",
]);
const adoptionDocument = requirePhrases("docs/adoption-validation.md", [
  "D0 / D+7 adoption validation",
  "Earliest valid date: 2026-08-29 Asia/Singapore",
  "Evidence Ledger",
  "stale-base blocking",
  "human accept/reject boundary",
  "do not authorize Chat, RAG, cloud, or MCP expansion",
]);

if (!adoptionDocument.includes(`fixture_sha256: ${fixtureHash}`)) {
  throw new Error("Adoption template fixture hash does not match the canonical fixture manifest");
}

function singaporeDate() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

const today = process.env.LWC_ADOPTION_TODAY || singaporeDate();
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error(`Invalid LWC_ADOPTION_TODAY: ${today}`);

function parseCsvLine(line, lineNumber) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted && character === '"' && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  if (quoted) throw new Error(`Adoption ledger row ${lineNumber} has an unterminated quoted field`);
  values.push(value);
  return values;
}

const lines = readFileSync(ledgerPath, "utf8").trim().split("\n");
const headers = parseCsvLine(lines[0], 1);
const requiredHeaders = [
  "observed_at",
  "day",
  "host",
  "host_version",
  "evidence_kind",
  "status",
  "candidate_commit",
  "fixture_id",
  "fixture_sha256",
  "context_hash",
  "source_hash",
  "content_hash",
  "formal_markdown_changed",
  "apply_without_review",
  "install_source",
  "star_source",
];
for (const header of requiredHeaders) {
  if (!headers.includes(header)) throw new Error(`Adoption ledger is missing column: ${header}`);
}

const rows = lines.slice(1).map((line, index) => {
  const values = parseCsvLine(line, index + 2);
  if (values.length !== headers.length) throw new Error(`Adoption ledger row ${index + 2} has ${values.length} fields; expected ${headers.length}`);
  return Object.fromEntries(headers.map((header, field) => [header, values[field]]));
});
if (!rows.length) throw new Error("Adoption ledger has no observed rows");

for (const [index, row] of rows.entries()) {
  const line = index + 2;
  if (!["D0", "D+7"].includes(row.day)) throw new Error(`Adoption ledger row ${line} has an unsupported day: ${row.day}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.observed_at)) throw new Error(`Adoption ledger row ${line} has an invalid observed_at date`);
  if (row.observed_at > today) throw new Error(`Adoption ledger row ${line} is future-dated: ${row.observed_at} > ${today}`);
  if (row.fixture_sha256 !== fixtureHash) throw new Error(`Adoption ledger row ${line} has a non-canonical fixture hash`);
  if (!row.install_source || !row.star_source) throw new Error(`Adoption ledger row ${line} is missing installation or Star attribution`);
  if (row.day === "D0" && row.observed_at !== "2026-08-22") throw new Error(`D0 row ${line} must retain the observed 2026-08-22 date`);
  if (row.day === "D+7") {
    if (today < targetDate) throw new Error(`D+7 cannot be recorded before ${targetDate}; current Singapore date is ${today}`);
    if (row.observed_at < targetDate) throw new Error(`D+7 row ${line} predates ${targetDate}`);
    if (row.evidence_kind === "host-runtime" && row.status === "passed") {
      if (!/^[a-f0-9]{40}$/.test(row.candidate_commit)) throw new Error(`D+7 host-runtime pass ${line} is missing a full candidate commit`);
      if (![row.context_hash, row.source_hash, row.content_hash].every((hash) => /^[a-f0-9]{64}$/.test(hash))) {
        throw new Error(`D+7 host-runtime pass ${line} is missing a full evidence hash`);
      }
      if (row.formal_markdown_changed !== "false") throw new Error(`D+7 host-runtime pass ${line} changed formal Markdown`);
      if (!["blocked", "not-attempted"].includes(row.apply_without_review)) {
        throw new Error(`D+7 host-runtime pass ${line} did not preserve the human review boundary`);
      }
    }
  }
  if (row.evidence_kind === "compatibility-fixture" && row.status !== "pending-real-host") {
    throw new Error(`Compatibility fixture row ${line} must remain pending-real-host`);
  }
}

const d0Rows = rows.filter((row) => row.day === "D0").length;
const d7Rows = rows.filter((row) => row.day === "D+7").length;
const d7HostPasses = rows.filter((row) => row.day === "D+7" && row.evidence_kind === "host-runtime" && row.status === "passed").length;
if (today >= targetDate && d7HostPasses === 0) {
  throw new Error(`Adoption readiness requires at least one D+7 technical host pass on or after ${targetDate}`);
}
console.log(`Adoption readiness passed for ${today}: ${d0Rows} D0 row(s), ${d7Rows} D+7 row(s), ${d7HostPasses} technical host pass(es), fixture ${fixtureHash}`);
