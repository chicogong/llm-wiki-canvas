import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyKnowledgeProposal,
  createKnowledgeIntake,
  intakeToMarkdown,
  proposeKnowledgeIntake,
  readProposalInbox,
  readKnowledgeIntake,
  reviewKnowledgeProposal,
} from "../src/core/index.js";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "lwc-intake-wiki-"));
  const sources = await mkdtemp(path.join(tmpdir(), "lwc-intake-source-"));
  const source = path.join(sources, "meeting.txt");
  await writeFile(path.join(root, "index.md"), "# Home\n");
  await writeFile(source, "Decision: keep Markdown as truth.\n");
  return { root, source };
}

describe("governed source intake", () => {
  it("creates a source-bound isolated draft without changing formal Markdown", async () => {
    const { root, source } = await fixture();
    const created = await createKnowledgeIntake(root, source, "concepts/Decision.md", "Codex", new Date("2026-08-11T00:00:00Z"));
    expect(created.intake).toMatchObject({
      schemaVersion: 1,
      status: "draft",
      generator: "Codex",
      createdAt: "2026-08-11T00:00:00.000Z",
      source: { name: "meeting.txt", bytes: 34 },
      draft: { path: "concepts/Decision.md" },
    });
    await expect(readKnowledgeIntake(created.manifestPath)).resolves.toEqual(created.intake);
    await expect(readFile(created.sourceSnapshotPath, "utf8")).resolves.toBe("Decision: keep Markdown as truth.\n");
    const draft = await readFile(created.draftPath, "utf8");
    expect(draft).toContain(`source: intake:${created.intake.id}`);
    expect(draft).toContain(`source_sha256: ${created.intake.source.sha256}`);
    expect(draft).not.toContain(source);
    await expect(readFile(path.join(root, "concepts/Decision.md"), "utf8")).rejects.toThrow();
    expect(intakeToMarkdown(created.intake)).toContain("Draft target: `concepts/Decision.md`");
    await expect(createKnowledgeIntake(root, source, "concepts/Decision.md", "Claude", new Date("2026-08-11T01:00:00Z"))).rejects.toThrow("Duplicate intake");
  });

  it("requires an edited draft and completes the existing proposal review gate", async () => {
    const { root, source } = await fixture();
    const created = await createKnowledgeIntake(root, source, "concepts/Decision.md", "Codex", new Date("2026-08-11T00:00:00Z"));
    await expect(proposeKnowledgeIntake(root, created.manifestPath, "Record decision")).rejects.toThrow("has not been edited");
    await writeFile(created.draftPath, "---\ntitle: Decision\ntype: concept\nsource: intake\n---\n# Decision\n\nKeep Markdown as truth. [[../index]]\n");
    const proposed = await proposeKnowledgeIntake(root, created.manifestPath, "Record decision", new Date("2026-08-11T01:00:00Z"));
    expect(proposed.intake).toMatchObject({ status: "proposed", proposal: { id: proposed.proposal.id, proposedAt: "2026-08-11T01:00:00.000Z" } });
    expect(proposed.proposal).toMatchObject({
      status: "proposed",
      intake: { id: created.intake.id, sourceName: "meeting.txt", sourceHash: created.intake.source.sha256, target: "concepts/Decision.md", generator: "Codex" },
      changes: [{ path: "concepts/Decision.md", operation: "create" }],
    });
    expect(intakeToMarkdown(proposed.intake)).toContain(`Proposal: \`${proposed.proposal.id}\``);
    await expect(readFile(path.join(root, "concepts/Decision.md"), "utf8")).rejects.toThrow();
    const proposalsRoot = path.join(root, ".lwc", "proposals");
    await mkdir(proposalsRoot, { recursive: true });
    await writeFile(path.join(proposalsRoot, `${proposed.proposal.id}.json`), `${JSON.stringify(proposed.proposal)}\n`);
    await expect(readProposalInbox(root)).resolves.toMatchObject({ proposals: [{ intake: { id: created.intake.id, sourceHash: created.intake.source.sha256 } }] });
    const reviewed = reviewKnowledgeProposal(proposed.proposal, proposed.proposal.id, "Human reviewer", undefined, new Date("2026-08-11T02:00:00Z"));
    const tampered = structuredClone(reviewed);
    if (tampered.intake) tampered.intake.sourceName = "different.txt";
    await expect(applyKnowledgeProposal(root, tampered, tampered.id)).rejects.toThrow("Proposal changed after review");
    await applyKnowledgeProposal(root, reviewed, reviewed.id, new Date("2026-08-11T03:00:00Z"));
    await expect(readFile(path.join(root, "concepts/Decision.md"), "utf8")).resolves.toContain("Keep Markdown as truth");
  });

  it("blocks proposal creation when the original source changes", async () => {
    const { root, source } = await fixture();
    const created = await createKnowledgeIntake(root, source, "Decision.md");
    await writeFile(created.draftPath, "# Decision\n\nDrafted knowledge.\n");
    await writeFile(source, "A different source.\n");
    await expect(proposeKnowledgeIntake(root, created.manifestPath, "Changed source")).rejects.toThrow("source changed");
  });

  it("blocks tampered snapshots and undeclared additional targets", async () => {
    const first = await fixture();
    const tampered = await createKnowledgeIntake(first.root, first.source, "Decision.md");
    await writeFile(tampered.draftPath, "# Decision\n\nDrafted knowledge.\n");
    await writeFile(tampered.sourceSnapshotPath, "tampered\n");
    await expect(proposeKnowledgeIntake(first.root, tampered.manifestPath, "Tampered snapshot")).rejects.toThrow("snapshot integrity failed");

    const second = await fixture();
    const expanded = await createKnowledgeIntake(second.root, second.source, "Decision.md");
    await writeFile(expanded.draftPath, "# Decision\n\nDrafted knowledge.\n");
    await writeFile(path.join(path.dirname(expanded.manifestPath), "Unexpected.md"), "# Unexpected\n");
    await expect(proposeKnowledgeIntake(second.root, expanded.manifestPath, "Expanded scope")).rejects.toThrow("only its declared target");
  });

  it("rejects unsupported, generated-state, and symbolic-link sources", async () => {
    const { root, source } = await fixture();
    const binary = path.join(path.dirname(source), "source.pdf");
    await writeFile(binary, "not a PDF");
    await expect(createKnowledgeIntake(root, binary, "Decision.md")).rejects.toThrow("Markdown or text");
    const disguisedBinary = path.join(path.dirname(source), "binary.txt");
    await writeFile(disguisedBinary, new Uint8Array([65, 0, 66]));
    await expect(createKnowledgeIntake(root, disguisedBinary, "Decision.md")).rejects.toThrow("valid UTF-8 text");
    await mkdir(path.join(root, ".lwc"), { recursive: true });
    const generated = path.join(root, ".lwc", "generated.txt");
    await writeFile(generated, "generated state\n");
    await expect(createKnowledgeIntake(root, generated, "Decision.md")).rejects.toThrow("generated .lwc state");
    const linked = path.join(path.dirname(source), "linked.txt");
    await symlink(source, linked);
    await expect(createKnowledgeIntake(root, linked, "Decision.md")).rejects.toThrow("symbolic link");
  });

  it("requires a Vault-owned manifest and never removes a colliding intake directory", async () => {
    const { root, source } = await fixture();
    const fixed = new Date("2026-08-11T00:00:00Z");
    const created = await createKnowledgeIntake(root, source, "Decision.md", undefined, fixed);
    const external = path.join(await mkdtemp(path.join(tmpdir(), "lwc-external-intake-")), "intake.json");
    await writeFile(external, `${JSON.stringify(created.intake)}\n`);
    await expect(proposeKnowledgeIntake(root, external, "Forged location")).rejects.toThrow("must stay under this Vault");

    const marker = path.join(path.dirname(created.manifestPath), "keep-me.txt");
    await writeFile(marker, "existing local work\n");
    await writeFile(created.manifestPath, "{invalid\n");
    await expect(createKnowledgeIntake(root, source, "Decision.md", undefined, fixed)).rejects.toThrow();
    await expect(readFile(marker, "utf8")).resolves.toBe("existing local work\n");
  });

  it("does not write intake state through a symbolic-link .lwc directory", async () => {
    const { root, source } = await fixture();
    const externalState = await mkdtemp(path.join(tmpdir(), "lwc-external-state-"));
    await symlink(externalState, path.join(root, ".lwc"));
    await expect(createKnowledgeIntake(root, source, "Decision.md")).rejects.toThrow("local state must not cross a symbolic link");
  });
});
