import { access, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { agentScaffoldToMarkdown, applyAgentScaffold, inspectAgentCompatibility, parseAgentHosts, planAgentScaffold, type AgentScaffoldTemplates } from "../src/core/index.js";

const templates: AgentScaffoldTemplates = {
  skill: "---\nname: llm-wiki-canvas\ndescription: Safe local Markdown knowledge workflow for coding Agents.\n---\n\nRun lwc intake create, then lwc proposal apply only after human review.\n",
  metadata: "interface:\n  display_name: \"LLM Wiki Canvas\"\n  default_prompt: \"Use $llm-wiki-canvas safely.\"\n",
  contract: "# Wiki Contract\n\n## Generated artifacts\n\nMarkdown remains truth.\n",
};

async function emptyWorkspace(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "lwc-init-"));
}

describe("safe Agent scaffolding", () => {
  it("defaults to a deterministic no-write preview", async () => {
    const root = await emptyWorkspace();
    const hosts = parseAgentHosts("workbuddy,qoder,claude,codex,trae,codex");
    const plan = await planAgentScaffold(root, hosts, templates);
    expect(hosts).toEqual(["codex", "claude-code", "qoder", "trae", "workbuddy"]);
    expect(plan).toMatchObject({ mode: "dry-run", summary: { create: 7, preserve: 0, conflict: 0, manual: 1 } });
    await expect(access(path.join(root, "AGENTS.md"))).rejects.toMatchObject({ code: "ENOENT" });
    const markdown = agentScaffoldToMarkdown(plan);
    expect(markdown).toContain("No integration files were written");
    expect(markdown).not.toContain(root);
  });

  it("creates only missing files and reaches the shared compatibility contract", async () => {
    const root = await emptyWorkspace();
    const hosts = parseAgentHosts("codex,claude-code,qoder,trae,workbuddy");
    const result = await applyAgentScaffold(root, hosts, templates);
    expect(result).toMatchObject({ mode: "written", summary: { create: 7, preserve: 0, conflict: 0, manual: 1 } });
    const report = await inspectAgentCompatibility(root);
    expect(report.summary).toEqual({ ready: 4, manual: 1, incomplete: 0 });
    expect(await readFile(path.join(root, ".agents/skills/llm-wiki-canvas/SKILL.md"), "utf8")).toBe(templates.skill);

    const second = await planAgentScaffold(root, hosts, templates);
    expect(second.summary).toEqual({ create: 0, preserve: 7, conflict: 0, manual: 1 });
  });

  it("preserves valid workspace-owned rules and blocks all writes on one stale adapter", async () => {
    const root = await emptyWorkspace();
    await mkdir(path.join(root, ".qoder/skills/llm-wiki-canvas"), { recursive: true });
    const customRules = "# My rules\nUse proposal review. Never expose secrets.\n";
    await writeFile(path.join(root, "AGENTS.md"), customRules);
    await writeFile(path.join(root, ".qoder/skills/llm-wiki-canvas/SKILL.md"), "Copied stale workflow.\n");
    const hosts = parseAgentHosts("codex,qoder");
    const preview = await planAgentScaffold(root, hosts, templates);
    expect(preview.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "AGENTS.md", status: "preserve" }),
      expect.objectContaining({ path: ".qoder/skills/llm-wiki-canvas/SKILL.md", status: "conflict" }),
    ]));
    await expect(applyAgentScaffold(root, hosts, templates)).rejects.toThrow("no files were written");
    expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toBe(customRules);
    await expect(access(path.join(root, ".agents/skills/llm-wiki-canvas/SKILL.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects unknown or empty host selections", () => {
    expect(() => parseAgentHosts("cursor")).toThrow("Unsupported Agent host");
    expect(() => parseAgentHosts(" , ")).toThrow("At least one Agent host");
  });
});
