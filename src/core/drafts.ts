import { createHash } from "node:crypto";
import { lstat, readFile, stat } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import { parseKnowledgeIntake, type IntakeStatus, type KnowledgeIntake } from "./intake.js";
import { knowledgeTargetPath, parseKnowledgeProposal } from "./proposal.js";

export type DraftInboxState = "ready" | "needs-draft" | "blocked" | "proposed";
export type EvidenceState = "verified" | "changed" | "missing" | "unsafe";

export interface DraftInboxItem {
  file: string;
  id: string;
  rootName: string;
  status: IntakeStatus;
  state: DraftInboxState;
  createdAt: string;
  generator?: string;
  source: KnowledgeIntake["source"] & {
    state: EvidenceState;
    snapshotState: EvidenceState;
    snapshotContent?: string;
  };
  draft: KnowledgeIntake["draft"] & {
    state: "edited" | "placeholder" | "missing";
    currentHash: string | null;
    content?: string;
    scope: "declared-only" | "expanded";
  };
  target: {
    operation: "create" | "update" | "unsafe";
    currentHash: string | null;
  };
  proposal?: KnowledgeIntake["proposal"] & { state: EvidenceState };
  blockers: string[];
}

export interface DraftInboxIssue {
  file: string;
  message: string;
}

export interface DraftInbox {
  drafts: DraftInboxItem[];
  issues: DraftInboxIssue[];
}

const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const unix = (value: string) => value.split(path.sep).join("/");

async function readEvidence(target: string): Promise<{ state: "readable" | "missing" | "unsafe"; content?: string; bytes?: Uint8Array }> {
  const info = await lstat(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  if (!info) return { state: "missing" };
  if (info.isSymbolicLink() || !info.isFile()) return { state: "unsafe" };
  const bytes = await readFile(target);
  return { state: "readable", content: bytes.toString("utf8"), bytes };
}

function evidenceState(evidence: Awaited<ReturnType<typeof readEvidence>>, expectedHash: string, expectedBytes?: number): EvidenceState {
  if (evidence.state !== "readable") return evidence.state;
  return hash(evidence.bytes ?? new Uint8Array()) === expectedHash && (expectedBytes === undefined || evidence.bytes?.byteLength === expectedBytes) ? "verified" : "changed";
}

async function proposalState(root: string, intake: KnowledgeIntake): Promise<EvidenceState> {
  if (!intake.proposal) return "missing";
  const target = path.resolve(root, ...intake.proposal.file.split("/"));
  const evidence = await readEvidence(target);
  if (evidence.state !== "readable") return evidence.state;
  try {
    const proposal = parseKnowledgeProposal(JSON.parse(evidence.content ?? ""));
    return proposal.id === intake.proposal.id && proposal.intake?.id === intake.id && proposal.intake.sourceHash === intake.source.sha256 && proposal.intake.target === intake.draft.path
      ? "verified" : "changed";
  } catch {
    return "changed";
  }
}

async function toDraftItem(root: string, manifestFile: string, intake: KnowledgeIntake): Promise<DraftInboxItem> {
  const intakeRoot = path.dirname(path.join(root, ...manifestFile.split("/")));
  const expectedManifest = unix(path.join(".lwc", "drafts", intake.id, "intake.json"));
  if (manifestFile !== expectedManifest) throw new Error(`Intake manifest location does not match id ${intake.id}`);

  const [original, snapshot, draftFiles] = await Promise.all([
    readEvidence(intake.source.path),
    readEvidence(path.join(intakeRoot, ...intake.source.snapshot.split("/"))),
    fg(["**/*.md"], { cwd: intakeRoot, onlyFiles: true, dot: false, followSymbolicLinks: false }),
  ]);
  const sourceState = evidenceState(original, intake.source.sha256, intake.source.bytes);
  const snapshotState = evidenceState(snapshot, intake.source.sha256);
  const draftEvidence = await readEvidence(path.join(intakeRoot, ...intake.draft.path.split("/")));
  const currentDraftHash = draftEvidence.state === "readable" ? hash(draftEvidence.bytes ?? new Uint8Array()) : null;
  const draftState = draftEvidence.state !== "readable" ? "missing" : currentDraftHash === intake.draft.initialHash ? "placeholder" : "edited";
  const normalizedFiles = draftFiles.map(unix).sort();
  const scope = normalizedFiles.length === 1 && normalizedFiles[0] === intake.draft.path ? "declared-only" : "expanded";

  const targetPath = knowledgeTargetPath(root, intake.draft.path);
  const targetEvidence = await readEvidence(targetPath);
  const target = targetEvidence.state === "missing" ? { operation: "create" as const, currentHash: null }
    : targetEvidence.state === "readable" ? { operation: "update" as const, currentHash: hash(targetEvidence.bytes ?? new Uint8Array()) }
      : { operation: "unsafe" as const, currentHash: null };
  const linkedProposalState = intake.proposal ? await proposalState(root, intake) : undefined;
  const blockers: string[] = [];
  if (sourceState !== "verified") blockers.push(`Original source is ${sourceState}.`);
  if (snapshotState !== "verified") blockers.push(`Source snapshot is ${snapshotState}.`);
  if (draftState === "missing") blockers.push("Declared draft is missing.");
  if (scope === "expanded") blockers.push("Draft contains undeclared Markdown targets.");
  if (target.operation === "unsafe") blockers.push("Formal target is not a regular file path.");
  if (intake.status === "proposed" && linkedProposalState !== "verified") blockers.push(`Linked proposal is ${linkedProposalState ?? "missing"}.`);
  const state: DraftInboxState = blockers.length ? "blocked" : intake.status === "proposed" ? "proposed" : draftState === "placeholder" ? "needs-draft" : "ready";

  return {
    file: manifestFile,
    id: intake.id,
    rootName: intake.rootName,
    status: intake.status,
    state,
    createdAt: intake.createdAt,
    generator: intake.generator,
    source: { ...intake.source, state: sourceState, snapshotState, snapshotContent: snapshot.content },
    draft: { ...intake.draft, state: draftState, currentHash: currentDraftHash, content: draftEvidence.content, scope },
    target,
    proposal: intake.proposal && linkedProposalState ? { ...intake.proposal, state: linkedProposalState } : undefined,
    blockers,
  };
}

export async function readDraftInbox(root: string): Promise<DraftInbox> {
  const absoluteRoot = path.resolve(root);
  const rootInfo = await stat(absoluteRoot).catch(() => undefined);
  if (!rootInfo?.isDirectory()) throw new Error(`Wiki root is not a directory: ${absoluteRoot}`);
  const files = await fg([".lwc/drafts/*/intake.json"], { cwd: absoluteRoot, onlyFiles: true, dot: true, followSymbolicLinks: false });
  const drafts: DraftInboxItem[] = [];
  const issues: DraftInboxIssue[] = [];
  for (const file of files.map(unix).sort()) {
    try {
      const intake = parseKnowledgeIntake(JSON.parse(await readFile(path.join(absoluteRoot, ...file.split("/")), "utf8")));
      if (intake.rootName !== path.basename(absoluteRoot)) throw new Error(`Intake belongs to ${intake.rootName}, not ${path.basename(absoluteRoot)}`);
      drafts.push(await toDraftItem(absoluteRoot, file, intake));
    } catch (error) {
      issues.push({ file, message: error instanceof Error ? error.message : String(error) });
    }
  }
  const order: Record<DraftInboxState, number> = { blocked: 0, ready: 1, "needs-draft": 2, proposed: 3 };
  drafts.sort((a, b) => order[a.state] - order[b.state] || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  return { drafts, issues };
}
