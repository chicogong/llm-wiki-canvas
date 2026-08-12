import { mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildGraph, buildKnowledgeContext, checkOkfBundle, knowledgeContextToMarkdown, okfReportToMarkdown } from "../src/core/index.js";

const publicFixture = path.resolve("examples/okf-trust");

describe("OKF v0.2 compatibility", () => {
  it("reads arbitrary concept types, trust signals, root links, and attested contracts", async () => {
    const graph = await buildGraph(publicFixture, new Date("2026-08-12T00:00:00Z"), new Date("2026-08-12T00:00:00Z"));
    expect(graph.okf).toEqual({ version: "0.2", recognized: true });
    const metric = graph.nodes.find((node) => node.path === "metrics/release-readiness.md");
    expect(metric).toMatchObject({
      kind: "concept",
      type: "Metric",
      summary: "A release is ready only when its public checks pass and a person accepts the candidate.",
      trust: { tier: "human-reviewed", status: "stable", stale: false, sources: [{ id: "release-policy", resource: "/references/release-policy.md" }] },
    });
    const computation = graph.nodes.find((node) => node.path === "computations/release-check.md");
    expect(computation?.attestedComputation).toMatchObject({ runtime: "node", parameters: [{ name: "commit", type: "string", required: true }], executor: { receipt: ["commit", "checks", "conclusion"] } });
    expect(graph.stats.brokenLinks).toBe(0);
    expect(graph.edges.some((edge) => edge.source === metric?.id && edge.target === computation?.id)).toBe(true);
  });

  it("validates the synthetic public bundle without running its contracts", async () => {
    const report = await checkOkfBundle(publicFixture);
    expect(report).toMatchObject({ targetVersion: "0.2", declaredVersion: "0.2", conformant: true, summary: { errors: 0, warnings: 0 } });
    expect(okfReportToMarkdown(report)).toContain("never executes an Attested Computation");
  });

  it("surfaces malformed trust and computation fields as exact conformance issues", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "lwc-okf-invalid-"));
    await writeFile(path.join(root, "index.md"), "---\nokf_version: '0.2'\n---\n# Invalid\n");
    await writeFile(path.join(root, "bad.md"), "---\ntype: Attested Computation\nstatus: trusted\nstale_after: next-week\nsources:\n  - title: Missing resource\nverified: { by: human:test }\n---\n# Bad\n");
    const report = await checkOkfBundle(root);
    expect(report.conformant).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["OKF_INVALID_SOURCES", "OKF_INVALID_VERIFIED", "OKF_INVALID_STATUS", "OKF_INVALID_STALE_AFTER", "OKF_INVALID_COMPUTATION"]));
  });

  it("rejects symlinked concepts as unsafe bundle input", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "lwc-okf-link-"));
    const outside = path.join(await mkdtemp(path.join(tmpdir(), "lwc-okf-outside-")), "outside.md");
    await writeFile(path.join(root, "index.md"), "# Bundle\n");
    await writeFile(outside, "---\ntype: Reference\n---\n# Outside\n");
    await symlink(outside, path.join(root, "linked.md"));
    const report = await checkOkfBundle(root);
    expect(report.issues).toContainEqual(expect.objectContaining({ code: "OKF_UNSAFE_FILE", path: "linked.md" }));
  });

  it("carries trust and non-execution evidence into a bounded context pack", async () => {
    const graph = await buildGraph(publicFixture, new Date("2026-08-12T00:00:00Z"));
    const bundle = await buildKnowledgeContext(publicFixture, graph, "Release readiness", { depth: 1, maxPages: 4, maxWords: 800 });
    const markdown = knowledgeContextToMarkdown(bundle);
    expect(bundle.pages[0].trust).toMatchObject({ tier: "human-reviewed", stale: false });
    expect(markdown).toContain("Trust: human-reviewed");
    expect(markdown).toContain("contract is descriptive and was not executed");
    expect(markdown).not.toContain(publicFixture);
  });
});
