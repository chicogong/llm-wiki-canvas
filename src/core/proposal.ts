import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";

export type ProposalStatus = "proposed" | "reviewed" | "applied" | "rejected";

export interface ProposalChange {
  path: string;
  operation: "create" | "update";
  baseHash: string | null;
  baseContent: string | null;
  contentHash: string;
  content: string;
}

export interface KnowledgeProposal {
  schemaVersion: 1;
  id: string;
  rootName: string;
  summary: string;
  status: ProposalStatus;
  createdAt: string;
  changes: ProposalChange[];
  review?: {
    reviewer: string;
    reviewedAt: string;
    note?: string;
    proposalHash: string;
    reviewHash: string;
  };
  rejection?: {
    rejectedAt: string;
    reason: string;
  };
  application?: {
    appliedAt: string;
    proposalHash: string;
    reviewHash: string;
  };
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const unix = (value: string) => value.split(path.sep).join("/");

function proposalPayload(proposal: KnowledgeProposal): string {
  return JSON.stringify({
    schemaVersion: proposal.schemaVersion,
    id: proposal.id,
    rootName: proposal.rootName,
    summary: proposal.summary,
    createdAt: proposal.createdAt,
    changes: proposal.changes,
  });
}

export function proposalHash(proposal: KnowledgeProposal): string {
  return hash(proposalPayload(proposal));
}

function reviewHash(proposalHashValue: string, reviewer: string, reviewedAt: string, note?: string): string {
  return hash(JSON.stringify({ proposalHash: proposalHashValue, reviewer, reviewedAt, note }));
}

function targetPath(root: string, relative: string): string {
  const clean = unix(relative).replace(/^\.\//, "");
  if (!clean || path.posix.isAbsolute(clean) || clean.split("/").some((part) => !part || part === "." || part === ".." || part.startsWith("."))) {
    throw new Error(`Unsafe proposal target path: ${relative}`);
  }
  if (!clean.toLowerCase().endsWith(".md") || ["agents.md", "claude.md"].includes(path.posix.basename(clean).toLowerCase())) {
    throw new Error(`Proposal targets must be knowledge Markdown files: ${relative}`);
  }
  const absoluteRoot = path.resolve(root);
  const absolute = path.resolve(absoluteRoot, ...clean.split("/"));
  if (!absolute.startsWith(`${absoluteRoot}${path.sep}`)) throw new Error(`Proposal target escapes wiki root: ${relative}`);
  return absolute;
}

async function assertNoSymlink(root: string, relative: string): Promise<void> {
  let current = path.resolve(root);
  for (const part of unix(relative).split("/").slice(0, -1)) {
    current = path.join(current, part);
    const info = await lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (!info) break;
    if (info.isSymbolicLink()) throw new Error(`Proposal target crosses a symbolic link: ${relative}`);
  }
  const targetInfo = await lstat(targetPath(root, relative)).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  if (targetInfo?.isSymbolicLink()) throw new Error(`Proposal target is a symbolic link: ${relative}`);
}

async function optionalFile(target: string): Promise<string | null> {
  try {
    const info = await stat(target);
    if (!info.isFile()) throw new Error(`Proposal target is not a file: ${target}`);
    return await readFile(target, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function createKnowledgeProposal(root: string, draftRoot: string, summary: string, createdAt = new Date()): Promise<KnowledgeProposal> {
  const absoluteRoot = path.resolve(root);
  const rootInfo = await stat(absoluteRoot).catch(() => undefined);
  if (!rootInfo?.isDirectory()) throw new Error(`Wiki root is not a directory: ${absoluteRoot}`);
  const absoluteDraft = path.resolve(draftRoot);
  const draftInfo = await stat(absoluteDraft).catch(() => undefined);
  if (!draftInfo?.isDirectory()) throw new Error(`Proposal draft is not a directory: ${absoluteDraft}`);

  const files = await fg(["**/*.md"], { cwd: absoluteDraft, onlyFiles: true, dot: false, followSymbolicLinks: false });
  const changes: ProposalChange[] = [];
  for (const relative of files.sort()) {
    const clean = unix(relative);
    const target = targetPath(absoluteRoot, clean);
    await assertNoSymlink(absoluteRoot, clean);
    const [baseContent, content] = await Promise.all([optionalFile(target), readFile(path.join(absoluteDraft, relative), "utf8")]);
    if (baseContent === content) continue;
    changes.push({
      path: clean,
      operation: baseContent === null ? "create" : "update",
      baseHash: baseContent === null ? null : hash(baseContent),
      baseContent,
      contentHash: hash(content),
      content,
    });
  }
  if (!changes.length) throw new Error("Proposal draft contains no changed Markdown files");
  const proposalBase = {
    schemaVersion: 1 as const,
    rootName: path.basename(absoluteRoot),
    summary: summary.trim() || "Knowledge update",
    status: "proposed" as const,
    createdAt: createdAt.toISOString(),
    changes,
  };
  const id = `proposal-${hash(JSON.stringify(proposalBase)).slice(0, 12)}`;
  return { ...proposalBase, id };
}

export function parseKnowledgeProposal(value: unknown): KnowledgeProposal {
  if (!value || typeof value !== "object") throw new Error("Proposal must be a JSON object");
  const proposal = value as KnowledgeProposal;
  if (proposal.schemaVersion !== 1 || !proposal.id?.startsWith("proposal-") || !["proposed", "reviewed", "applied", "rejected"].includes(proposal.status)) {
    throw new Error("Unsupported or invalid proposal schema");
  }
  if (!proposal.rootName || !proposal.summary || !proposal.createdAt || !Array.isArray(proposal.changes) || !proposal.changes.length) {
    throw new Error("Proposal metadata or changes are missing");
  }
  for (const change of proposal.changes) {
    targetPath("/proposal-root", change.path);
    if (!["create", "update"].includes(change.operation) || typeof change.content !== "string" || hash(change.content) !== change.contentHash) {
      throw new Error(`Proposal change integrity failed: ${change.path}`);
    }
    if (change.operation === "create" && (change.baseHash !== null || change.baseContent !== null)) throw new Error(`Invalid create proposal: ${change.path}`);
    if (change.operation === "update" && (typeof change.baseContent !== "string" || hash(change.baseContent) !== change.baseHash)) {
      throw new Error(`Invalid update proposal: ${change.path}`);
    }
  }
  if (["reviewed", "applied"].includes(proposal.status)) {
    if (!proposal.review) throw new Error(`Proposal in ${proposal.status} state is missing its review record`);
    const expectedProposalHash = proposalHash(proposal);
    if (proposal.review.proposalHash !== expectedProposalHash) throw new Error("Proposal changed after review; review it again before apply");
    if (proposal.review.reviewHash !== reviewHash(expectedProposalHash, proposal.review.reviewer, proposal.review.reviewedAt, proposal.review.note)) {
      throw new Error("Review record changed after approval; review it again before apply");
    }
  }
  if (proposal.status === "applied") {
    if (!proposal.application) throw new Error("Applied proposal is missing its application record");
    if (proposal.application.proposalHash !== proposal.review?.proposalHash || proposal.application.reviewHash !== proposal.review?.reviewHash) {
      throw new Error("Application record does not match the reviewed proposal");
    }
  }
  if (proposal.status === "rejected" && !proposal.rejection) throw new Error("Rejected proposal is missing its rejection record");
  return proposal;
}

function confirm(proposal: KnowledgeProposal, confirmation: string): void {
  if (confirmation !== proposal.id) throw new Error(`Confirmation must exactly match proposal id: ${proposal.id}`);
}

export function reviewKnowledgeProposal(proposalValue: unknown, confirmation: string, reviewer: string, note: string | undefined, reviewedAt = new Date()): KnowledgeProposal {
  const proposal = parseKnowledgeProposal(proposalValue);
  confirm(proposal, confirmation);
  if (proposal.status !== "proposed") throw new Error(`Only proposed knowledge can be reviewed; current status is ${proposal.status}`);
  if (!reviewer.trim()) throw new Error("Reviewer is required");
  const proposalHashValue = proposalHash(proposal);
  const reviewerValue = reviewer.trim();
  const reviewedAtValue = reviewedAt.toISOString();
  const noteValue = note?.trim() || undefined;
  return {
    ...proposal,
    status: "reviewed",
    review: {
      reviewer: reviewerValue,
      reviewedAt: reviewedAtValue,
      note: noteValue,
      proposalHash: proposalHashValue,
      reviewHash: reviewHash(proposalHashValue, reviewerValue, reviewedAtValue, noteValue),
    },
  };
}

export function rejectKnowledgeProposal(proposalValue: unknown, confirmation: string, reason: string, rejectedAt = new Date()): KnowledgeProposal {
  const proposal = parseKnowledgeProposal(proposalValue);
  confirm(proposal, confirmation);
  if (!["proposed", "reviewed"].includes(proposal.status)) throw new Error(`Cannot reject proposal in ${proposal.status} state`);
  if (!reason.trim()) throw new Error("Rejection reason is required");
  return { ...proposal, status: "rejected", rejection: { rejectedAt: rejectedAt.toISOString(), reason: reason.trim() } };
}

export async function applyKnowledgeProposal(root: string, proposalValue: unknown, confirmation: string, appliedAt = new Date()): Promise<KnowledgeProposal> {
  const proposal = parseKnowledgeProposal(proposalValue);
  confirm(proposal, confirmation);
  if (proposal.status !== "reviewed" || !proposal.review) throw new Error(`Only reviewed knowledge can be applied; current status is ${proposal.status}`);
  const expectedProposalHash = proposalHash(proposal);
  if (proposal.review.proposalHash !== expectedProposalHash) throw new Error("Proposal changed after review; review it again before apply");
  if (proposal.review.reviewHash !== reviewHash(expectedProposalHash, proposal.review.reviewer, proposal.review.reviewedAt, proposal.review.note)) {
    throw new Error("Review record changed after approval; review it again before apply");
  }
  if (path.basename(path.resolve(root)) !== proposal.rootName) throw new Error(`Proposal root mismatch: expected ${proposal.rootName}`);

  const originals = new Map<string, string | null>();
  for (const change of proposal.changes) {
    await assertNoSymlink(root, change.path);
    const current = await optionalFile(targetPath(root, change.path));
    const currentHash = current === null ? null : hash(current);
    if (currentHash !== change.baseHash) throw new Error(`Target changed since proposal: ${change.path}`);
    originals.set(change.path, current);
  }

  const written: string[] = [];
  try {
    for (const change of proposal.changes) {
      const target = targetPath(root, change.path);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, change.content, "utf8");
      written.push(change.path);
    }
  } catch (error) {
    for (const relative of written.reverse()) {
      const original = originals.get(relative);
      const target = targetPath(root, relative);
      if (original === null) await rm(target, { force: true });
      else if (typeof original === "string") await writeFile(target, original, "utf8");
    }
    throw error;
  }

  return {
    ...proposal,
    status: "applied",
    application: { appliedAt: appliedAt.toISOString(), proposalHash: expectedProposalHash, reviewHash: proposal.review.reviewHash },
  };
}

export interface ProposalDiffLine {
  kind: "context" | "add" | "remove";
  text: string;
}

export function proposalDiff(change: ProposalChange): ProposalDiffLine[] {
  const before = (change.baseContent ?? "").split("\n");
  const after = change.content.split("\n");
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix += 1;
  const contextStart = Math.max(0, prefix - 2);
  const beforeEnd = before.length - suffix;
  const afterEnd = after.length - suffix;
  const suffixEnd = Math.min(before.length, beforeEnd + 2);
  return [
    ...before.slice(contextStart, prefix).map((text) => ({ kind: "context" as const, text })),
    ...before.slice(prefix, beforeEnd).map((text) => ({ kind: "remove" as const, text })),
    ...after.slice(prefix, afterEnd).map((text) => ({ kind: "add" as const, text })),
    ...before.slice(beforeEnd, suffixEnd).map((text) => ({ kind: "context" as const, text })),
  ];
}

export function proposalToMarkdown(proposalValue: unknown): string {
  const proposal = parseKnowledgeProposal(proposalValue);
  const lines = [
    `# Knowledge proposal ${proposal.id}`,
    "",
    `- Status: **${proposal.status}**`,
    `- Wiki root: \`${proposal.rootName}\``,
    `- Summary: ${proposal.summary}`,
    `- Created: \`${proposal.createdAt}\``,
    `- Changes: ${proposal.changes.length}`,
  ];
  if (proposal.review) lines.push(`- Reviewed by: ${proposal.review.reviewer} at \`${proposal.review.reviewedAt}\``);
  if (proposal.rejection) lines.push(`- Rejected: ${proposal.rejection.reason}`);
  if (proposal.application) lines.push(`- Applied: \`${proposal.application.appliedAt}\``);
  for (const change of proposal.changes) {
    lines.push(
      "",
      `## ${change.operation}: \`${change.path}\``,
      "",
      `Base SHA-256: \`${change.baseHash ?? "missing"}\`  `,
      `Proposed SHA-256: \`${change.contentHash}\``,
      "",
      "```diff",
      ...proposalDiff(change).map((line) => `${line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " "}${line.text}`),
      "```",
    );
  }
  lines.push("");
  return lines.join("\n");
}
