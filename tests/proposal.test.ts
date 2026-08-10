import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyKnowledgeProposal,
  createKnowledgeProposal,
  proposalToMarkdown,
  readProposalInbox,
  rejectKnowledgeProposal,
  reviewKnowledgeProposal,
} from "../src/core/index.js";

async function proposalFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "lwc-proposal-wiki-"));
  const draft = await mkdtemp(path.join(tmpdir(), "lwc-proposal-draft-"));
  await mkdir(path.join(root, "concepts"));
  await mkdir(path.join(draft, "concepts"));
  await writeFile(path.join(root, "index.md"), "# Home\n\n[[concepts/Existing]]\n");
  await writeFile(path.join(root, "concepts/Existing.md"), "# Existing\n\nOld text.\n");
  await writeFile(path.join(draft, "index.md"), "# Home\n\n[[concepts/Existing]]\n");
  await writeFile(path.join(draft, "concepts/Existing.md"), "# Existing\n\nReviewed text.\n");
  await writeFile(path.join(draft, "concepts/New.md"), "# New\n\nLinked from [[Existing]].\n");
  return { root, draft };
}

describe("knowledge proposal lifecycle", () => {
  it("creates a reviewable proposal without changing source files", async () => {
    const { root, draft } = await proposalFixture();
    const proposal = await createKnowledgeProposal(root, draft, "Add reviewed knowledge", new Date("2026-08-10T00:00:00Z"));
    expect(proposal.status).toBe("proposed");
    expect(proposal.changes.map((change) => [change.path, change.operation])).toEqual([
      ["concepts/Existing.md", "update"],
      ["concepts/New.md", "create"],
    ]);
    await expect(readFile(path.join(root, "concepts/Existing.md"), "utf8")).resolves.toContain("Old text");
    await expect(readFile(path.join(root, "concepts/New.md"), "utf8")).rejects.toThrow();
    const rendered = proposalToMarkdown(proposal);
    expect(rendered).toContain("-Old text.");
    expect(rendered).toContain("+Reviewed text.");
    expect(rendered).toContain("Base SHA-256: `missing`");
  });

  it("requires exact review confirmation and rejects target drift before apply", async () => {
    const { root, draft } = await proposalFixture();
    const proposed = await createKnowledgeProposal(root, draft, "Guard against drift", new Date("2026-08-10T00:00:00Z"));
    expect(() => reviewKnowledgeProposal(proposed, "wrong-id", "Reviewer", undefined)).toThrow("Confirmation must exactly match");
    const reviewed = reviewKnowledgeProposal(proposed, proposed.id, "Reviewer", "Looks correct", new Date("2026-08-10T01:00:00Z"));
    await writeFile(path.join(root, "concepts/Existing.md"), "# Existing\n\nConcurrent edit.\n");
    await expect(applyKnowledgeProposal(root, reviewed, reviewed.id)).rejects.toThrow("Target changed since proposal: concepts/Existing.md");
    await expect(readFile(path.join(root, "concepts/New.md"), "utf8")).rejects.toThrow();
  });

  it("applies only reviewed, untampered content and records the decision", async () => {
    const { root, draft } = await proposalFixture();
    const proposed = await createKnowledgeProposal(root, draft, "Apply reviewed files", new Date("2026-08-10T00:00:00Z"));
    await expect(applyKnowledgeProposal(root, proposed, proposed.id)).rejects.toThrow("Only reviewed knowledge can be applied");
    const reviewed = reviewKnowledgeProposal(proposed, proposed.id, "A. Reviewer", undefined, new Date("2026-08-10T01:00:00Z"));
    const tampered = structuredClone(reviewed);
    if (tampered.review) tampered.review.reviewer = "Someone else";
    await expect(applyKnowledgeProposal(root, tampered, tampered.id)).rejects.toThrow("Review record changed after approval");

    const applied = await applyKnowledgeProposal(root, reviewed, reviewed.id, new Date("2026-08-10T02:00:00Z"));
    expect(applied.status).toBe("applied");
    expect(applied.application).toMatchObject({ appliedAt: "2026-08-10T02:00:00.000Z" });
    await expect(readFile(path.join(root, "concepts/Existing.md"), "utf8")).resolves.toContain("Reviewed text");
    await expect(readFile(path.join(root, "concepts/New.md"), "utf8")).resolves.toContain("# New");
    await expect(applyKnowledgeProposal(root, applied, applied.id)).rejects.toThrow("Only reviewed knowledge can be applied");
  });

  it("records rejection without changing source files", async () => {
    const { root, draft } = await proposalFixture();
    const proposed = await createKnowledgeProposal(root, draft, "Reject this", new Date("2026-08-10T00:00:00Z"));
    const rejected = rejectKnowledgeProposal(proposed, proposed.id, "Source is insufficient", new Date("2026-08-10T01:00:00Z"));
    expect(rejected).toMatchObject({ status: "rejected", rejection: { reason: "Source is insufficient" } });
    await expect(applyKnowledgeProposal(root, rejected, rejected.id)).rejects.toThrow("Only reviewed knowledge can be applied");
    await expect(readFile(path.join(root, "concepts/Existing.md"), "utf8")).resolves.toContain("Old text");
  });

  it("rejects repository instructions and hidden targets", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "lwc-proposal-safe-"));
    const instructions = await mkdtemp(path.join(tmpdir(), "lwc-proposal-instructions-"));
    await writeFile(path.join(instructions, "AGENTS.md"), "# Replace instructions\n");
    await expect(createKnowledgeProposal(root, instructions, "Unsafe")).rejects.toThrow("knowledge Markdown files");

    const hidden = await mkdtemp(path.join(tmpdir(), "lwc-proposal-hidden-"));
    await mkdir(path.join(hidden, ".secret"));
    await writeFile(path.join(hidden, ".secret", "Note.md"), "# Secret\n");
    await expect(createKnowledgeProposal(root, hidden, "Hidden")).rejects.toThrow("no changed Markdown files");
  });

  it("builds a read-only inbox with exact diffs and isolated invalid files", async () => {
    const { root, draft } = await proposalFixture();
    const proposal = await createKnowledgeProposal(root, draft, "Inbox review", new Date("2026-08-10T00:00:00Z"));
    const proposalsRoot = path.join(root, ".lwc", "proposals");
    await mkdir(proposalsRoot, { recursive: true });
    await writeFile(path.join(proposalsRoot, "valid.json"), `${JSON.stringify(proposal)}\n`);
    await writeFile(path.join(proposalsRoot, "invalid.json"), "{not-json\n");
    await writeFile(path.join(proposalsRoot, "wrong-root.json"), `${JSON.stringify({ ...proposal, rootName: "other-vault" })}\n`);
    await writeFile(path.join(proposalsRoot, "fake-reviewed.json"), `${JSON.stringify({ ...proposal, status: "reviewed" })}\n`);

    const inbox = await readProposalInbox(root);
    expect(inbox.proposals).toHaveLength(1);
    expect(inbox.proposals[0]).toMatchObject({
      file: ".lwc/proposals/valid.json",
      id: proposal.id,
      status: "proposed",
      changes: [
        { path: "concepts/Existing.md", operation: "update" },
        { path: "concepts/New.md", operation: "create", baseHash: null },
      ],
    });
    expect(inbox.proposals[0].changes[0].diff).toEqual(expect.arrayContaining([
      { kind: "remove", text: "Old text." },
      { kind: "add", text: "Reviewed text." },
    ]));
    expect(inbox.proposals[0].changes.map((change) => change.targetState)).toEqual(["unchanged", "unchanged"]);
    expect(inbox.proposals[0].topology).toMatchObject({
      addedLinks: [{ source: "concepts/New.md", target: "Existing", kind: "wikilink" }],
      removedLinks: [],
      conflicts: [],
    });
    expect(inbox.issues).toEqual(expect.arrayContaining([
      { file: ".lwc/proposals/invalid.json", message: expect.stringContaining("JSON") },
      { file: ".lwc/proposals/wrong-root.json", message: expect.stringContaining("other-vault") },
      { file: ".lwc/proposals/fake-reviewed.json", message: expect.stringContaining("missing its review record") },
    ]));

    await writeFile(path.join(root, "concepts/Existing.md"), "# Existing\n\nConcurrent edit.\n");
    const conflicted = await readProposalInbox(root);
    expect(conflicted.proposals[0].changes[0].targetState).toBe("conflict");
    expect(conflicted.proposals[0].topology.conflicts).toEqual(["concepts/Existing.md"]);
  });

  it("returns an empty inbox when a Vault has no proposal directory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "lwc-empty-inbox-"));
    await expect(readProposalInbox(root)).resolves.toEqual({ proposals: [], issues: [] });
  });
});
