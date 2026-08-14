import { lstat, readFile, stat } from "node:fs/promises";
import path from "node:path";

export type AgentHostId = "codex" | "claude-code" | "deepseek-harness" | "qoder" | "trae" | "workbuddy";
export type AgentHostStatus = "ready" | "manual" | "incomplete";
export type CompatibilityCheckStatus = "pass" | "manual" | "fail";

export interface CompatibilityCheck {
  id: string;
  label: string;
  path: string;
  status: CompatibilityCheckStatus;
  detail: string;
}

export interface AgentHostCompatibility {
  id: AgentHostId;
  name: string;
  integration: string;
  status: AgentHostStatus;
  checks: CompatibilityCheck[];
}

export interface AgentCompatibilityReport {
  schemaVersion: 1;
  rootName: string;
  contract: {
    rules: string;
    skill: string;
  };
  hosts: AgentHostCompatibility[];
  summary: {
    ready: number;
    manual: number;
    incomplete: number;
  };
}

interface FileEvidence {
  state: "readable" | "missing" | "unsafe";
  content?: string;
}

const RULES = "AGENTS.md";
const SKILL = ".agents/skills/llm-wiki-canvas/SKILL.md";
const CLAUDE_RULES = "CLAUDE.md";
const CLAUDE_SKILL = ".claude/skills/llm-wiki-canvas/SKILL.md";
const QODER_SKILL = ".qoder/skills/llm-wiki-canvas/SKILL.md";
const CANONICAL_REFERENCE = "../../../.agents/skills/llm-wiki-canvas/SKILL.md";

async function evidence(root: string, relative: string): Promise<FileEvidence> {
  const target = path.resolve(root, ...relative.split("/"));
  const info = await lstat(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  if (!info) return { state: "missing" };
  if (info.isSymbolicLink() || !info.isFile()) return { state: "unsafe" };
  return { state: "readable", content: await readFile(target, "utf8") };
}

function fileCheck(id: string, label: string, file: string, value: FileEvidence, validate: (content: string) => boolean, expected: string): CompatibilityCheck {
  if (value.state !== "readable") return { id, label, path: file, status: "fail", detail: value.state === "missing" ? "File is missing." : "Path must be a regular file, not a symbolic link." };
  return validate(value.content ?? "")
    ? { id, label, path: file, status: "pass", detail: expected }
    : { id, label, path: file, status: "fail", detail: `File exists but does not ${expected.toLowerCase()}` };
}

function host(id: AgentHostId, name: string, integration: string, checks: CompatibilityCheck[], manual = false): AgentHostCompatibility {
  const failed = checks.some((check) => check.status === "fail");
  return { id, name, integration, status: failed ? "incomplete" : manual ? "manual" : "ready", checks };
}

export async function inspectAgentCompatibility(root: string): Promise<AgentCompatibilityReport> {
  const absoluteRoot = path.resolve(root);
  const rootInfo = await stat(absoluteRoot).catch(() => undefined);
  if (!rootInfo?.isDirectory()) throw new Error(`Workspace root is not a directory: ${absoluteRoot}`);

  const [rulesEvidence, skillEvidence, claudeRulesEvidence, claudeSkillEvidence, qoderSkillEvidence] = await Promise.all([
    evidence(absoluteRoot, RULES),
    evidence(absoluteRoot, SKILL),
    evidence(absoluteRoot, CLAUDE_RULES),
    evidence(absoluteRoot, CLAUDE_SKILL),
    evidence(absoluteRoot, QODER_SKILL),
  ]);
  const rules = fileCheck("shared-rules", "Shared repository rules", RULES, rulesEvidence, (content) => /proposal/i.test(content) && /review/i.test(content) && /(private|credential|secret)/i.test(content), "Declare the reviewed-write and privacy boundaries.");
  const skill = fileCheck("canonical-skill", "Canonical Agent Skill", SKILL, skillEvidence, (content) => /^name: llm-wiki-canvas$/m.test(content) && /lwc intake create/.test(content) && /lwc proposal apply/.test(content), "Expose the canonical intake and proposal workflow.");
  const claudeRules = fileCheck("claude-rules", "Claude Code rules import", CLAUDE_RULES, claudeRulesEvidence, (content) => /^@AGENTS\.md$/m.test(content), "Import AGENTS.md.");
  const claudeSkill = fileCheck("claude-skill", "Claude Code Skill adapter", CLAUDE_SKILL, claudeSkillEvidence, (content) => content.includes(CANONICAL_REFERENCE), "Reference the canonical Skill.");
  const qoderSkill = fileCheck("qoder-skill", "Qoder Skill adapter", QODER_SKILL, qoderSkillEvidence, (content) => content.includes(CANONICAL_REFERENCE), "Reference the canonical Skill.");
  const manualContext: CompatibilityCheck = { id: "workbuddy-context", label: "Explicit workspace context", path: `${RULES} + ${SKILL}`, status: "manual", detail: "Attach both files explicitly; automatic Skill discovery is not claimed." };

  const hosts: AgentHostCompatibility[] = [
    host("codex", "Codex", "AGENTS.md + project Skill", [rules, skill]),
    host("claude-code", "Claude Code", "CLAUDE.md + project Skill adapter", [rules, skill, claudeRules, claudeSkill]),
    host("deepseek-harness", "DeepSeek Harness", "Automatic .agents/skills discovery", [rules, skill]),
    host("qoder", "Qoder", "AGENTS.md + project Skill adapter", [rules, skill, qoderSkill]),
    host("trae", "TRAE", "AGENTS.md + shared project Skill", [rules, skill]),
    host("workbuddy", "Tencent WorkBuddy", "Explicit workspace references", [rules, skill, manualContext], true),
  ];
  return {
    schemaVersion: 1,
    rootName: path.basename(absoluteRoot),
    contract: { rules: RULES, skill: SKILL },
    hosts,
    summary: {
      ready: hosts.filter((item) => item.status === "ready").length,
      manual: hosts.filter((item) => item.status === "manual").length,
      incomplete: hosts.filter((item) => item.status === "incomplete").length,
    },
  };
}

export function agentCompatibilityToMarkdown(report: AgentCompatibilityReport): string {
  const lines: string[] = [
    `# Agent compatibility — ${report.rootName}`,
    "",
    "This matrix verifies repository integration files and the shared review contract. It does not claim that a proprietary host binary was executed.",
    "",
    `- Canonical rules: \`${report.contract.rules}\``,
    `- Canonical Skill: \`${report.contract.skill}\``,
    `- Result: **${report.summary.ready} ready · ${report.summary.manual} manual · ${report.summary.incomplete} incomplete**`,
    "",
    "| Host | Status | Integration | Evidence |",
    "| --- | --- | --- | --- |",
    ...report.hosts.map((item) => `| ${item.name} | **${item.status}** | ${item.integration} | ${item.checks.map((check) => `\`${check.path}\` ${check.status}`).join("<br>")} |`),
    "",
  ];
  const failed = new Map<string, { check: CompatibilityCheck; hosts: string[] }>();
  for (const hostItem of report.hosts) {
    for (const check of hostItem.checks.filter((item) => item.status === "fail")) {
      const existing = failed.get(check.id);
      if (existing) existing.hosts.push(hostItem.name);
      else failed.set(check.id, { check, hosts: [hostItem.name] });
    }
  }
  if (failed.size) lines.push(
    "## Problems",
    "",
    ...[...failed.values()].map(({ check, hosts }) => `- \`${check.path}\`: ${check.detail} Affects ${hosts.join(", ")}.`),
    "",
  );
  lines.push(
    "## Interpretation",
    "",
    "- **ready**: required repository rules and Skill entry points are present and internally consistent.",
    "- **manual**: the shared contract is valid, but the host requires explicit file attachment or workspace context.",
    "- **incomplete**: at least one required file is missing, unsafe, or stale.",
    "",
    "All hosts must preserve the same boundary: Agents may inspect and create proposals; review and apply remain explicit human-controlled transitions.",
    "",
  );
  return lines.join("\n");
}
