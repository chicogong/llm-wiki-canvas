import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createKnowledgeIntake, proposeKnowledgeIntake, readDraftInbox } from "../src/core/index.js";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "lwc-drafts-wiki-"));
  const sourceRoot = await mkdtemp(path.join(tmpdir(), "lwc-drafts-source-"));
  const source = path.join(sourceRoot, "brief.txt");
  await writeFile(path.join(root, "index.md"), "# Home\n");
  await writeFile(source, "Evidence for a governed draft.\n");
  return { root, source };
}

describe("draft inbox", () => {
  it("moves a verified intake from placeholder to ready without changing the Vault", async () => {
    const { root, source } = await fixture();
    const created = await createKnowledgeIntake(root, source, "concepts/Brief.md", "Codex", new Date("2026-08-11T00:00:00Z"));
    let inbox = await readDraftInbox(root);
    expect(inbox).toMatchObject({
      issues: [],
      drafts: [{
        id: created.intake.id,
        state: "needs-draft",
        source: { state: "verified", snapshotState: "verified", snapshotContent: "Evidence for a governed draft.\n" },
        draft: { state: "placeholder", scope: "declared-only" },
        target: { operation: "create", currentHash: null },
      }],
    });
    await writeFile(created.draftPath, "# Brief\n\nSource-grounded draft. [[../index]]\n");
    inbox = await readDraftInbox(root);
    expect(inbox.drafts[0]).toMatchObject({ state: "ready", draft: { state: "edited", content: expect.stringContaining("Source-grounded") }, blockers: [] });
    await expect(readFile(path.join(root, "concepts/Brief.md"), "utf8")).rejects.toThrow();
  });

  it("surfaces source drift, expanded scope, and invalid manifests without hiding valid drafts", async () => {
    const first = await fixture();
    const changed = await createKnowledgeIntake(first.root, first.source, "Brief.md");
    await writeFile(changed.draftPath, "# Brief\n\nDraft.\n");
    await writeFile(first.source, "Changed evidence.\n");
    await writeFile(path.join(path.dirname(changed.manifestPath), "Extra.md"), "# Extra\n");
    const invalidRoot = path.join(first.root, ".lwc", "drafts", "invalid");
    await mkdir(invalidRoot, { recursive: true });
    await writeFile(path.join(invalidRoot, "intake.json"), "{invalid\n");
    const inbox = await readDraftInbox(first.root);
    expect(inbox.drafts[0]).toMatchObject({ state: "blocked", source: { state: "changed" }, draft: { scope: "expanded" } });
    expect(inbox.drafts[0].blockers).toEqual(expect.arrayContaining(["Original source is changed.", "Draft contains undeclared Markdown targets."]));
    expect(inbox.issues).toEqual([{ file: ".lwc/drafts/invalid/intake.json", message: expect.stringContaining("JSON") }]);
  });

  it("verifies the proposal linked from a completed intake", async () => {
    const { root, source } = await fixture();
    const created = await createKnowledgeIntake(root, source, "Brief.md", "Claude Code", new Date("2026-08-11T00:00:00Z"));
    await writeFile(created.draftPath, "# Brief\n\nDraft ready for review.\n");
    const proposed = await proposeKnowledgeIntake(root, created.manifestPath, "Add brief", new Date("2026-08-11T01:00:00Z"));
    const proposalPath = path.join(root, ...proposed.intake.proposal!.file.split("/"));
    await mkdir(path.dirname(proposalPath), { recursive: true });
    await writeFile(proposalPath, `${JSON.stringify(proposed.proposal)}\n`);
    await writeFile(created.manifestPath, `${JSON.stringify(proposed.intake)}\n`);
    await expect(readDraftInbox(root)).resolves.toMatchObject({ drafts: [{ state: "proposed", proposal: { id: proposed.proposal.id, state: "verified" } }], issues: [] });
  });
});
