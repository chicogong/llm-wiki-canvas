import { lstat, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentHostId } from "./compatibility.js";

export interface AgentScaffoldTemplates {
  skill: string;
  metadata: string;
  contract: string;
}

export type AgentScaffoldActionStatus = "create" | "preserve" | "conflict" | "manual";

export interface AgentScaffoldAction {
  path: string;
  status: AgentScaffoldActionStatus;
  detail: string;
}

export interface AgentScaffoldPlan {
  schemaVersion: 1;
  rootName: string;
  hosts: AgentHostId[];
  mode: "dry-run" | "written";
  actions: AgentScaffoldAction[];
  summary: {
    create: number;
    preserve: number;
    conflict: number;
    manual: number;
  };
}

interface ScaffoldFile {
  path: string;
  content: string;
  valid: (content: string) => boolean;
  detail: string;
}

const HOST_ORDER: AgentHostId[] = ["codex", "claude-code", "qoder", "trae", "workbuddy"];
const SKILL_PATH = ".agents/skills/llm-wiki-canvas/SKILL.md";
const SKILL_REFERENCE = "../../../.agents/skills/llm-wiki-canvas/SKILL.md";

const rulesTemplate = `# Agent Guide

This workspace uses LLM Wiki Canvas. Markdown and source notes are truth; graphs and diagrams are rebuildable views.

- Read the nearest repository rules and wiki index before editing.
- Run \`lwc report <vault>\` and \`lwc lint <vault>\` before proposing structural changes.
- Keep Agent-authored Markdown isolated, then use \`lwc proposal create/show\` for reviewable changes.
- Never review, reject, or apply on behalf of a person. Apply only after explicit human direction and exact-ID confirmation.
- Never commit private vaults, credentials, sessions, machine-local state, or absolute personal paths.
`;

const claudeRulesTemplate = `@AGENTS.md

Use the project Skill at \`.claude/skills/llm-wiki-canvas/SKILL.md\` for knowledge-base work.
`;

const adapterTemplate = `---
name: llm-wiki-canvas
description: Build, inspect, lint, and visualize a local Markdown or Obsidian knowledge wiki through the canonical shared Skill.
---

# LLM Wiki Canvas

Read and follow the canonical cross-Agent Skill at \`${SKILL_REFERENCE}\`. Resolve its supporting files from \`.agents/skills/llm-wiki-canvas/\` at the repository root.
`;

function summary(actions: AgentScaffoldAction[]): AgentScaffoldPlan["summary"] {
  return {
    create: actions.filter((item) => item.status === "create").length,
    preserve: actions.filter((item) => item.status === "preserve").length,
    conflict: actions.filter((item) => item.status === "conflict").length,
    manual: actions.filter((item) => item.status === "manual").length,
  };
}

export function parseAgentHosts(value: string): AgentHostId[] {
  const aliases = new Map<string, AgentHostId>([
    ["codex", "codex"], ["claude", "claude-code"], ["claude-code", "claude-code"],
    ["qoder", "qoder"], ["trae", "trae"], ["workbuddy", "workbuddy"],
  ]);
  const requested = value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (!requested.length) throw new Error("At least one Agent host is required");
  const resolved = requested.map((item) => {
    const host = aliases.get(item);
    if (!host) throw new Error(`Unsupported Agent host: ${item}. Use codex, claude-code, qoder, trae, or workbuddy.`);
    return host;
  });
  return HOST_ORDER.filter((host) => resolved.includes(host));
}

function scaffoldFiles(hosts: AgentHostId[], templates: AgentScaffoldTemplates): ScaffoldFile[] {
  const files: ScaffoldFile[] = [
    { path: "AGENTS.md", content: rulesTemplate, valid: (content) => /proposal/i.test(content) && /review/i.test(content) && /(private|credential|secret)/i.test(content), detail: "Shared reviewed-write and privacy rules" },
    { path: SKILL_PATH, content: templates.skill, valid: (content) => /^name: llm-wiki-canvas$/m.test(content) && /lwc intake create/.test(content) && /lwc proposal apply/.test(content), detail: "Canonical LLM Wiki Canvas Skill" },
    { path: ".agents/skills/llm-wiki-canvas/agents/openai.yaml", content: templates.metadata, valid: (content) => /display_name: ["']?LLM Wiki Canvas/.test(content) && /\$llm-wiki-canvas/.test(content), detail: "Codex Skill interface metadata" },
    { path: ".agents/skills/llm-wiki-canvas/references/wiki-contract.md", content: templates.contract, valid: (content) => /# Wiki Contract/.test(content) && /Generated artifacts/.test(content), detail: "Shared Wiki file contract" },
  ];
  if (hosts.includes("claude-code")) files.push(
    { path: "CLAUDE.md", content: claudeRulesTemplate, valid: (content) => /^@AGENTS\.md$/m.test(content), detail: "Claude Code rules import" },
    { path: ".claude/skills/llm-wiki-canvas/SKILL.md", content: adapterTemplate, valid: (content) => content.includes(SKILL_REFERENCE), detail: "Claude Code Skill adapter" },
  );
  if (hosts.includes("qoder")) files.push(
    { path: ".qoder/skills/llm-wiki-canvas/SKILL.md", content: adapterTemplate, valid: (content) => content.includes(SKILL_REFERENCE), detail: "Qoder Skill adapter" },
  );
  return files;
}

async function fileAction(root: string, file: ScaffoldFile): Promise<AgentScaffoldAction> {
  const target = path.join(root, ...file.path.split("/"));
  const info = await lstat(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  if (!info) return { path: file.path, status: "create", detail: file.detail };
  if (info.isSymbolicLink() || !info.isFile()) return { path: file.path, status: "conflict", detail: "Existing path is not a regular file." };
  const content = await readFile(target, "utf8");
  return file.valid(content)
    ? { path: file.path, status: "preserve", detail: `${file.detail}; existing valid file remains owned by the workspace.` }
    : { path: file.path, status: "conflict", detail: `${file.detail}; existing file is stale or does not declare the required boundary.` };
}

async function assertSafeParents(root: string, relative: string): Promise<void> {
  let current = root;
  for (const part of relative.split("/").slice(0, -1)) {
    current = path.join(current, part);
    const info = await lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (!info) return;
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`Scaffold path crosses an unsafe parent: ${relative}`);
  }
}

export async function planAgentScaffold(root: string, hosts: AgentHostId[], templates: AgentScaffoldTemplates): Promise<AgentScaffoldPlan> {
  if (!hosts.length) throw new Error("At least one Agent host is required");
  const absoluteRoot = path.resolve(root);
  const rootInfo = await stat(absoluteRoot).catch(() => undefined);
  if (!rootInfo?.isDirectory()) throw new Error(`Workspace root is not a directory: ${absoluteRoot}`);
  const files = scaffoldFiles(hosts, templates);
  const actions = await Promise.all(files.map((file) => fileAction(absoluteRoot, file)));
  if (hosts.includes("workbuddy")) actions.push({ path: "AGENTS.md + .agents/skills/llm-wiki-canvas/SKILL.md", status: "manual", detail: "Attach both files explicitly in WorkBuddy; automatic discovery is not claimed." });
  return { schemaVersion: 1, rootName: path.basename(absoluteRoot), hosts, mode: "dry-run", actions, summary: summary(actions) };
}

export async function applyAgentScaffold(root: string, hosts: AgentHostId[], templates: AgentScaffoldTemplates): Promise<AgentScaffoldPlan> {
  const absoluteRoot = path.resolve(root);
  const plan = await planAgentScaffold(absoluteRoot, hosts, templates);
  if (plan.summary.conflict) throw new Error(`Agent scaffold has ${plan.summary.conflict} conflict(s); no files were written`);
  const files = new Map(scaffoldFiles(hosts, templates).map((file) => [file.path, file]));
  const created: string[] = [];
  try {
    for (const action of plan.actions.filter((item) => item.status === "create")) {
      const file = files.get(action.path);
      if (!file) continue;
      await assertSafeParents(absoluteRoot, file.path);
      const target = path.join(absoluteRoot, ...file.path.split("/"));
      await mkdir(path.dirname(target), { recursive: true });
      await assertSafeParents(absoluteRoot, file.path);
      await writeFile(target, file.content.endsWith("\n") ? file.content : `${file.content}\n`, { encoding: "utf8", flag: "wx" });
      created.push(target);
    }
  } catch (error) {
    await Promise.all(created.map((target) => unlink(target).catch(() => undefined)));
    throw error;
  }
  return { ...plan, mode: "written" };
}

export function agentScaffoldToMarkdown(plan: AgentScaffoldPlan): string {
  const lines = [
    `# Agent setup — ${plan.rootName}`,
    "",
    `- Mode: **${plan.mode}**`,
    `- Hosts: ${plan.hosts.join(", ")}`,
    `- Result: **${plan.summary.create} create · ${plan.summary.preserve} preserve · ${plan.summary.conflict} conflict · ${plan.summary.manual} manual**`,
    "",
    "| Path | Action | Reason |",
    "| --- | --- | --- |",
    ...plan.actions.map((action) => `| \`${action.path}\` | **${action.status}** | ${action.detail} |`),
    "",
    plan.mode === "dry-run" && !plan.summary.conflict ? "No integration files were written. Re-run with `--write` to create only the missing files." : plan.summary.conflict ? "No integration files were written. Resolve every conflict, then run the dry-run again." : "Only missing integration files were created. Existing valid files were preserved.",
    "",
  ];
  return lines.join("\n");
}
