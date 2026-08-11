import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { agentCompatibilityToMarkdown, inspectAgentCompatibility } from "../src/core/index.js";

const canonicalReference = "../../../.agents/skills/llm-wiki-canvas/SKILL.md";

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "lwc-agents-"));
  await Promise.all([
    mkdir(path.join(root, ".agents/skills/llm-wiki-canvas"), { recursive: true }),
    mkdir(path.join(root, ".claude/skills/llm-wiki-canvas"), { recursive: true }),
    mkdir(path.join(root, ".qoder/skills/llm-wiki-canvas"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(root, "AGENTS.md"), "# Rules\nUse proposal review before writes. Never commit private credentials.\n"),
    writeFile(path.join(root, "CLAUDE.md"), "@AGENTS.md\n"),
    writeFile(path.join(root, ".agents/skills/llm-wiki-canvas/SKILL.md"), "---\nname: llm-wiki-canvas\n---\nRun lwc intake create, then lwc proposal apply only after review.\n"),
    writeFile(path.join(root, ".claude/skills/llm-wiki-canvas/SKILL.md"), `Read ${canonicalReference}\n`),
    writeFile(path.join(root, ".qoder/skills/llm-wiki-canvas/SKILL.md"), `Read ${canonicalReference}\n`),
  ]);
  return root;
}

describe("Agent compatibility contract", () => {
  it("reports four ready hosts and one explicit manual integration", async () => {
    const root = await fixture();
    const report = await inspectAgentCompatibility(root);
    expect(report.summary).toEqual({ ready: 4, manual: 1, incomplete: 0 });
    expect(report.hosts.map((host) => [host.id, host.status])).toEqual([
      ["codex", "ready"],
      ["claude-code", "ready"],
      ["qoder", "ready"],
      ["trae", "ready"],
      ["workbuddy", "manual"],
    ]);
    expect(JSON.stringify(report)).not.toContain(root);
  });

  it("isolates a stale native adapter without overstating host support", async () => {
    const root = await fixture();
    await writeFile(path.join(root, ".qoder/skills/llm-wiki-canvas/SKILL.md"), "Use a copied workflow instead.\n");
    const report = await inspectAgentCompatibility(root);
    expect(report.summary).toEqual({ ready: 3, manual: 1, incomplete: 1 });
    expect(report.hosts.find((host) => host.id === "qoder")).toMatchObject({ status: "incomplete", checks: expect.arrayContaining([expect.objectContaining({ id: "qoder-skill", status: "fail" })]) });
    expect(report.hosts.find((host) => host.id === "claude-code")?.status).toBe("ready");
    const markdown = agentCompatibilityToMarkdown(report);
    expect(markdown).toContain("## Problems");
    expect(markdown).toContain("Affects Qoder");
    expect(markdown).not.toContain("Affects Claude Code");
  });

  it("renders a deterministic public matrix with an honest evidence boundary", async () => {
    const root = await fixture();
    const report = await inspectAgentCompatibility(root);
    const first = agentCompatibilityToMarkdown(report);
    const second = agentCompatibilityToMarkdown(report);
    expect(first).toBe(second);
    expect(first).toContain("4 ready · 1 manual · 0 incomplete");
    expect(first).toContain("does not claim that a proprietary host binary was executed");
    expect(first).toContain("| Tencent WorkBuddy | **manual** |");
    expect(first).not.toContain(root);
  });
});
