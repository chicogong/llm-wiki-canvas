import { mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildGraph, buildKnowledgeContext, checkOkfBundle, isIso8601Instant, knowledgeContextToMarkdown, latestVerification, okfReportToMarkdown, parseVerified } from "../src/core/index.js";

const publicFixture = path.resolve("examples/okf-trust");
const officialFixture = path.resolve("tests/fixtures/okf-official-acme/bundle");

describe("OKF v0.2 compatibility", () => {
  it("reads arbitrary concept types, trust signals, root links, and attested contracts", async () => {
    const graph = await buildGraph(publicFixture, new Date("2026-08-12T00:00:00Z"), new Date("2026-08-12T00:00:00Z"));
    expect(graph.okf).toEqual({ version: "0.2", recognized: true, conformant: true, issues: [] });
    const metric = graph.nodes.find((node) => node.path === "metrics/release-readiness.md");
    expect(metric).toMatchObject({
      kind: "concept",
      type: "Metric",
      summary: "A release is ready only when its public checks pass and a person accepts the candidate.",
      trust: { tier: "human-reviewed", status: "stable", stale: false, sources: [{ id: "release-policy", resource: "/references/release-policy.md" }] },
    });
    expect(metric?.metadata).toMatchObject({ type: "Metric", description: expect.any(String) });
    const computation = graph.nodes.find((node) => node.path === "computations/release-check.md");
    expect(computation?.attestedComputation).toMatchObject({ runtime: "node", parameters: [{ name: "commit", type: "string", required: true }], executor: { receipt: ["commit", "checks", "conclusion"] } });
    expect(graph.stats.brokenLinks).toBe(0);
    expect(graph.edges.some((edge) => edge.source === metric?.id && edge.target === computation?.id)).toBe(true);
  });

  it("strictly validates ISO 8601 instants and calendar dates", async () => {
    expect(isIso8601Instant("2026-08-12T01:02:03Z")).toBe(true);
    expect(isIso8601Instant("2026-08-12T01:02:03.456+08:00")).toBe(true);
    for (const invalid of ["2026-08-12", "2026-08-12 01:02:03Z", "2026-08-12T01:02:03", "2026-02-30T01:02:03Z", "2026-08-12T24:00:00Z"]) {
      expect(isIso8601Instant(invalid), invalid).toBe(false);
    }
    const root = await mkdtemp(path.join(tmpdir(), "lwc-okf-dates-"));
    await writeFile(path.join(root, "index.md"), "---\nokf_version: '0.2'\n---\n# Dates\n");
    await writeFile(path.join(root, "dates.md"), "---\ntype: Metric\ngenerated: { by: process:test, at: 2026-02-30T01:02:03Z }\nverified: { by: human:test, at: 2026-08-12 }\nstale_after: 2026-02-30\nsources:\n  - { resource: policy, last_modified: 2026-13-01 }\nusage_window: { from: 2026-01-01, to: 2026-02-30 }\n---\n# Dates\n");
    const report = await checkOkfBundle(root);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["OKF_INVALID_GENERATED", "OKF_INVALID_VERIFIED", "OKF_INVALID_STALE_AFTER", "OKF_INVALID_SOURCES"]));
  });

  it("selects the latest verification by timestamp instead of array position", () => {
    const verified = parseVerified([
      { by: "process:last-in-array", at: "2026-01-01T00:00:00Z" },
      { by: "human:latest-in-time", at: "2026-08-12T12:00:00Z" },
      { by: "process:middle", at: "2026-06-01T00:00:00Z" },
    ]);
    expect(latestVerification(verified)).toEqual({ by: "human:latest-in-time", at: "2026-08-12T12:00:00Z" });
    expect(verified.at(-1)?.by).toBe("human:latest-in-time");
  });

  it("regresses against the pinned official Acme Retail bundle without executing it", async () => {
    const report = await checkOkfBundle(officialFixture);
    expect(report).toMatchObject({ summary: { markdownFiles: 17, conceptDocuments: 9, errors: 1, warnings: 0 } });
    expect(report.issues).toEqual([expect.objectContaining({ code: "OKF_RESERVED_FRONTMATTER", path: "log.md" })]);
    const graph = await buildGraph(officialFixture, new Date("2026-08-12T00:00:00Z"), new Date("2026-08-12T00:00:00Z"));
    const metric = graph.nodes.find((node) => node.path === "metrics/gross-margin.md");
    expect(metric).toMatchObject({ type: "Metric", kind: "concept", resource: undefined });
    expect(metric?.metadata).toMatchObject({
      not: [expect.objectContaining({ term: "revenue minus product cost only" })],
      sources: expect.any(Array),
    });
    const policy = graph.nodes.find((node) => node.path === "policies/margin-standard.md");
    expect(policy).toMatchObject({ type: "Policy", resource: "https://wiki.acme.internal/finance/margin-standard" });
    expect(JSON.stringify(graph)).not.toContain(officialFixture);
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
    expect(bundle.pages[0].metadata).toMatchObject({ type: "Metric", description: expect.any(String) });
    expect(markdown).toContain("Trust: human-reviewed");
    expect(markdown).toContain("contract is descriptive and was not executed");
    expect(markdown).not.toContain(publicFixture);
  });
});
