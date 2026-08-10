import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const ignored = new Set([".git", "node_modules", "dist", "viewer-dist", "test-results", "playwright-report"]);
const patterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["GitHub token", /(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,})/],
  ["OpenAI API key", /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/],
  ["AWS access key", /AKIA[0-9A-Z]{16}/],
  ["Google API key", /AIza[0-9A-Za-z_-]{30,}/],
  ["Slack token", /xox[baprs]-[A-Za-z0-9-]{10,}/],
  ["absolute user path", /(?:\/Users\/[^/\s]+|\/home\/[^/\s]+|[A-Z]:\\Users\\[^\\\s]+)/],
];

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (ignored.has(entry.name)) return [];
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return files(target);
    if (!entry.isFile() || statSync(target).size > 1_000_000) return [];
    return [target];
  });
}

const findings = [];
for (const file of files(root)) {
  if (path.basename(file) === "pnpm-lock.yaml") continue;
  const content = readFileSync(file, "utf8");
  for (const [label, pattern] of patterns) {
    if (pattern.test(content)) findings.push(`${path.relative(root, file)}: ${label}`);
  }
}

if (findings.length) {
  console.error("Potential sensitive information detected (values withheld):");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}
console.log("Sensitive information scan passed");
