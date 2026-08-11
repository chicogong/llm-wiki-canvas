import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildGraph, buildWikiReport, graphToCanvas, graphToExcalidraw, graphToMermaid, reportToMarkdown, resolveFocusNode, selectFocusedGraph, type JsonCanvas } from "../src/core/index.js";

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "lwc-test-"));
  await mkdir(path.join(root, "concepts"));
  await writeFile(path.join(root, "index.md"), "---\ntitle: Home\ntype: index\n---\n# Home\nSee [[concepts/Graph]] and [[Missing]].\n");
  await writeFile(path.join(root, "concepts/Graph.md"), "---\ntags: [visual]\n---\n# Graph\nBack to [Home](../index.md).\n");
  return root;
}

describe("wiki graph compiler", () => {
  it("parses wikilinks, markdown links, metadata, and diagnostics", async () => {
    const graph = await buildGraph(await fixture(), new Date("2026-08-10T00:00:00Z"));
    expect(graph.generatedAt).toBe("2026-08-10T00:00:00.000Z");
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(2);
    expect(graph.stats.brokenLinks).toBe(1);
    expect(graph.nodes.find((node) => node.title === "Graph")?.tags).toEqual(["visual"]);
  });

  it("keeps stable IDs and preserves manual canvas positions", async () => {
    const root = await fixture();
    const first = await buildGraph(root, new Date("2026-08-10T00:00:00Z"));
    const second = await buildGraph(root, new Date("2026-08-11T00:00:00Z"));
    expect(first.nodes.map((node) => node.id)).toEqual(second.nodes.map((node) => node.id));
    const generated = graphToCanvas(first);
    const previous: JsonCanvas = { ...generated, nodes: generated.nodes.map((node, index) => index === 0 ? { ...node, x: 1234, y: -456, width: 777 } : node) };
    const rebuilt = graphToCanvas(second, previous);
    expect(rebuilt.nodes.find((node) => node.id === previous.nodes[0].id)).toMatchObject({ x: 1234, y: -456, width: 777 });
  });

  it("exports a deterministic editable Excalidraw scene without machine paths", async () => {
    const root = await fixture();
    const graph = await buildGraph(root, new Date("2026-08-10T00:00:00Z"));
    const first = graphToExcalidraw(graph);
    const second = graphToExcalidraw(graph);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ type: "excalidraw", version: 2, files: {} });
    expect(first.elements.filter((element) => element.type === "rectangle")).toHaveLength(graph.nodes.length);
    expect(first.elements.filter((element) => element.type === "arrow")).toHaveLength(graph.edges.length);
    expect(first.elements.find((element) => element.type === "arrow")).toMatchObject({ startBinding: { elementId: expect.stringMatching(/^x-node-/) }, endBinding: { elementId: expect.stringMatching(/^x-node-/) } });
    expect(first.elements.find((element) => element.type === "rectangle")?.boundElements).toEqual(expect.any(Array));
    expect(new Set(first.elements.map((element) => element.id)).size).toBe(first.elements.length);
    expect(first.elements.every((element) => element.width >= 0 && element.height >= 0)).toBe(true);
    expect(JSON.stringify(first)).toContain("concepts/Graph.md");
    expect(JSON.stringify(first)).not.toContain(root);
  });

  it("selects one shared focused graph for Mermaid and Excalidraw", async () => {
    const root = await fixture();
    const graph = await buildGraph(root, new Date("2026-08-10T00:00:00Z"));
    const focused = selectFocusedGraph(graph, "Home", { depth: 1, direction: "both", kinds: ["concept"] });
    expect(focused.focus.path).toBe("index.md");
    expect(focused.graph.nodes.map((node) => node.path)).toEqual(["concepts/Graph.md", "index.md"]);
    expect(focused.graph.edges).toHaveLength(2);
    expect(focused.graph.stats.brokenLinks).toBe(1);
    const mermaid = graphToMermaid(focused.graph, focused.focus);
    const excalidraw = graphToExcalidraw(focused.graph, { focusId: focused.focus.id });
    expect(mermaid).toContain("flowchart LR");
    expect(mermaid).toContain("%% BROKEN_LINK index.md -> Missing");
    expect(mermaid).toContain("classDef focus");
    expect(excalidraw.elements.filter((element) => element.type === "rectangle")).toHaveLength(focused.graph.nodes.length);
    expect(excalidraw.elements.filter((element) => element.type === "arrow")).toHaveLength(focused.graph.edges.length);
    expect(excalidraw.elements.find((element) => element.id === `x-${focused.focus.id}`)).toMatchObject({ strokeColor: "#173fc5", strokeWidth: 4 });
    expect(JSON.stringify(excalidraw)).not.toContain(root);
  });

  it("applies depth and direction without silently resolving ambiguous focus pages", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "lwc-focus-"));
    await mkdir(path.join(root, "a"));
    await mkdir(path.join(root, "b"));
    await writeFile(path.join(root, "a/Start.md"), "# Start\n[[Middle]]\n");
    await writeFile(path.join(root, "Middle.md"), "# Middle\n[[End]]\n");
    await writeFile(path.join(root, "End.md"), "# End\n");
    await writeFile(path.join(root, "b/Start.md"), "# Other Start\n[[Middle]]\n");
    const graph = await buildGraph(root);
    expect(selectFocusedGraph(graph, "Middle", { depth: 1, direction: "outgoing" }).graph.nodes.map((node) => node.path)).toEqual(["End.md", "Middle.md"]);
    expect(selectFocusedGraph(graph, "Middle", { depth: 1, direction: "incoming" }).graph.nodes.map((node) => node.path)).toEqual(["Middle.md", "a/Start.md", "b/Start.md"]);
    expect(selectFocusedGraph(graph, "Middle", { depth: 2, direction: "both" }).graph.nodes).toHaveLength(4);
    expect(() => resolveFocusNode(graph, "Start")).toThrow("ambiguous");
    expect(() => resolveFocusNode(graph, "Missing page")).toThrow("not found");
  });

  it("can fix generated and modified timestamps for reproducible fixtures", async () => {
    const root = await fixture();
    const fixed = new Date("2026-08-10T00:00:00Z");
    const graph = await buildGraph(root, fixed, fixed);
    expect(graph.generatedAt).toBe("2026-08-10T00:00:00.000Z");
    expect(new Set(graph.nodes.map((node) => node.modifiedAt))).toEqual(new Set(["2026-08-10T00:00:00.000Z"]));
  });

  it("emits valid file nodes that point to real Markdown", async () => {
    const root = await fixture();
    const canvas = graphToCanvas(await buildGraph(root));
    for (const node of canvas.nodes) await expect(readFile(path.join(root, node.file), "utf8")).resolves.toContain("#");
  });

  it("builds a factual wiki report without an arbitrary score", async () => {
    const graph = await buildGraph(await fixture(), new Date("2026-08-10T00:00:00Z"));
    const report = buildWikiReport(graph, 1);
    expect(report.summary).toMatchObject({ pages: 2, relationships: 2, connectedPages: 2, errors: 1, warnings: 0 });
    expect(report.mostConnected).toHaveLength(1);
    expect(report.mostConnected[0]).toMatchObject({ incoming: 1, outgoing: 1, total: 2 });
    expect(reportToMarkdown(report)).toContain("This report uses observed counts, not an arbitrary health score.");
    expect(reportToMarkdown(report)).toContain("| BROKEN_LINK | 1 |");
  });

  it("supports spaces, encoded paths, embeds, aliases, and literal percent signs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "lwc-links-"));
    await writeFile(path.join(root, "index.md"), "# Home\n[Space](<Space Note.md>) [Encoded](Encoded%20Note.md) [[100% Note|Percent]] ![[Asset]]\n");
    await writeFile(path.join(root, "Space Note.md"), "# Space Note\n");
    await writeFile(path.join(root, "Encoded Note.md"), "# Encoded Note\n");
    await writeFile(path.join(root, "100% Note.md"), "# Percent\n");
    await writeFile(path.join(root, "Asset.md"), "# Asset\n");
    const graph = await buildGraph(root);
    expect(graph.edges).toHaveLength(4);
    expect(graph.edges.map((edge) => edge.kind).sort()).toEqual(["embed", "markdown", "markdown", "wikilink"]);
    expect(graph.stats.brokenLinks).toBe(0);
  });

  it("deduplicates repeated relationships and excludes agent schema files", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "lwc-dedupe-"));
    await writeFile(path.join(root, "index.md"), "# Home\n[[Topic]] and again [[Topic]].\n");
    await writeFile(path.join(root, "Topic.md"), "# Topic\n");
    await writeFile(path.join(root, "AGENTS.md"), "# Instructions\n");
    await writeFile(path.join(root, "CLAUDE.md"), "@AGENTS.md\n");
    await mkdir(path.join(root, ".agents", "skills"), { recursive: true });
    await mkdir(path.join(root, ".claude", "skills"), { recursive: true });
    await mkdir(path.join(root, ".qoder", "skills"), { recursive: true });
    await writeFile(path.join(root, ".agents", "skills", "shared.md"), "# Shared Skill\n");
    await writeFile(path.join(root, ".claude", "skills", "claude.md"), "# Claude Skill\n");
    await writeFile(path.join(root, ".qoder", "skills", "qoder.md"), "# Qoder Skill\n");
    const graph = await buildGraph(root);
    expect(graph.nodes.map((node) => node.path)).toEqual(["Topic.md", "index.md"]);
    expect(graph.edges).toHaveLength(1);
  });

  it("reports ambiguous links, missing titles, and orphan page paths", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "lwc-diagnostics-"));
    await mkdir(path.join(root, "a"));
    await mkdir(path.join(root, "b"));
    await writeFile(path.join(root, "index.md"), "# Home\n[[Topic]]\n");
    await writeFile(path.join(root, "a/Topic.md"), "no heading\n");
    await writeFile(path.join(root, "b/Topic.md"), "# Other topic\n");
    const graph = await buildGraph(root);
    expect(graph.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "AMBIGUOUS_LINK", path: "index.md" }),
      expect.objectContaining({ code: "MISSING_TITLE", path: "a/Topic.md" }),
      expect.objectContaining({ code: "ORPHAN_PAGE", path: "a/Topic.md" }),
    ]));
  });

  it("builds a valid empty graph and canvas", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "lwc-empty-"));
    const graph = await buildGraph(root);
    expect(graph.stats).toEqual({ files: 0, links: 0, brokenLinks: 0, orphanNodes: 0 });
    expect(graphToCanvas(graph)).toEqual({ nodes: [], edges: [] });
    expect(buildWikiReport(graph).summary).toMatchObject({ pages: 0, relationships: 0, connectedPages: 0 });
    expect(reportToMarkdown(buildWikiReport(graph))).toContain("No Markdown pages were found.");
  });

  it("rejects a missing wiki root instead of reporting a false empty success", async () => {
    const missing = path.join(tmpdir(), `lwc-missing-${Date.now()}`);
    await expect(buildGraph(missing)).rejects.toThrow("Wiki root is not a directory");
  });
});
