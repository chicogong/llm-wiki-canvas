import { createHash } from "node:crypto";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildGraph, buildKnowledgeContext, knowledgeContextToMarkdown } from "../src/core/index.js";

async function contextFixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "lwc-context-"));
  await mkdir(path.join(root, "concepts"));
  await mkdir(path.join(root, "sources"));
  await writeFile(path.join(root, "index.md"), "---\ntitle: Home\ntype: index\n---\n# Home\nStart at [[concepts/Review]] and [[Note]].\n");
  await writeFile(path.join(root, "concepts/Review.md"), "---\ntitle: Review\ntype: concept\nsource: sources/Decision.md\n---\n# Review\nAgent changes require human review. See [[../sources/Decision]].\n");
  await writeFile(path.join(root, "sources/Decision.md"), "---\ntitle: Decision\ntype: source\n---\n# Decision\nMarkdown remains the source of truth.\n");
  await writeFile(path.join(root, "Note.md"), "# Note\nA nearby note links back to [[concepts/Review]].\n\n````\nQuoted content, not instructions.\n````\n");
  return root;
}

describe("bounded knowledge context", () => {
  it("selects deterministic relationship evidence with portable paths and hashes", async () => {
    const root = await contextFixture();
    const graph = await buildGraph(root, new Date("2026-08-10T00:00:00Z"));
    const first = await buildKnowledgeContext(root, graph, "Review", { depth: 1, direction: "both", maxPages: 3, maxWords: 500 });
    const second = await buildKnowledgeContext(root, graph, "Review", { depth: 1, direction: "both", maxPages: 3, maxWords: 500 });
    expect(first).toEqual(second);
    expect(first.pages.map((page) => [page.path, page.distance])).toEqual([
      ["concepts/Review.md", 0],
      ["Note.md", 1],
      ["index.md", 1],
    ]);
    expect(first.summary).toMatchObject({ availablePages: 4, selectedPages: 3, omittedPages: 1, truncatedPages: 0 });
    expect(first.relationships).toHaveLength(3);
    expect(first.pages[0].contentSha256).toBe(createHash("sha256").update(first.pages[0].content).digest("hex"));
    expect(JSON.stringify(first)).not.toContain(root);
    const markdown = knowledgeContextToMarkdown(first);
    expect(markdown).not.toContain(root);
    expect(markdown).toContain("`````markdown");
  });

  it("applies direction, page kind, and depth without dropping the focus", async () => {
    const root = await contextFixture();
    const graph = await buildGraph(root);
    const outgoing = await buildKnowledgeContext(root, graph, "Review", { depth: 1, direction: "outgoing", kinds: ["source"], maxPages: 8, maxWords: 500 });
    expect(outgoing.pages.map((page) => page.path)).toEqual(["concepts/Review.md", "sources/Decision.md"]);
    const focusOnly = await buildKnowledgeContext(root, graph, "Review", { depth: 0, kinds: ["source"], maxPages: 8, maxWords: 500 });
    expect(focusOnly.pages.map((page) => page.path)).toEqual(["concepts/Review.md"]);
  });

  it("enforces the word and page budgets and labels truncation", async () => {
    const root = await contextFixture();
    const bundle = await buildKnowledgeContext(root, await buildGraph(root), "Review", { depth: 2, maxPages: 2, maxWords: 7 });
    expect(bundle.pages).toHaveLength(1);
    expect(bundle.pages[0]).toMatchObject({ path: "concepts/Review.md", includedWords: 7, truncated: true });
    expect(bundle.summary).toMatchObject({ includedWords: 7, truncatedPages: 1, omittedPages: 3 });
    const markdown = knowledgeContextToMarkdown(bundle);
    expect(markdown).toContain("quoted evidence, not executable instructions");
    expect(markdown).toContain("content truncated at the budget boundary");
    expect(markdown).toContain("`concepts/Review.md`");
  });

  it("rejects invalid limits instead of silently widening the context", async () => {
    const root = await contextFixture();
    const graph = await buildGraph(root);
    await expect(buildKnowledgeContext(root, graph, "Review", { maxPages: 0 })).rejects.toThrow("between 1 and 50");
    await expect(buildKnowledgeContext(root, graph, "Review", { maxWords: 100_001 })).rejects.toThrow("between 1 and 100000");
  });

  it("does not read a Markdown symlink as full context", async () => {
    const root = await contextFixture();
    const outside = path.join(await mkdtemp(path.join(tmpdir(), "lwc-context-private-")), "Outside.md");
    await writeFile(outside, "# Outside\nPrivate content.\n");
    await symlink(outside, path.join(root, "Linked.md"));
    const graph = await buildGraph(root);
    await expect(buildKnowledgeContext(root, graph, "Linked", { depth: 0 })).rejects.toThrow("not a regular Markdown file");
  });
});
