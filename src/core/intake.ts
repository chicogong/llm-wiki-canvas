import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Stats } from "node:fs";
import fg from "fast-glob";
import { createKnowledgeProposal, knowledgeTargetPath, type KnowledgeProposal } from "./proposal.js";

export type IntakeStatus = "draft" | "proposed";

export interface KnowledgeIntake {
  schemaVersion: 1;
  id: string;
  rootName: string;
  status: IntakeStatus;
  createdAt: string;
  generator?: string;
  source: {
    name: string;
    path: string;
    snapshot: string;
    sha256: string;
    bytes: number;
  };
  draft: {
    path: string;
    initialHash: string;
  };
  proposal?: {
    id: string;
    file: string;
    proposedAt: string;
  };
}

export interface CreatedKnowledgeIntake {
  intake: KnowledgeIntake;
  manifestPath: string;
  draftPath: string;
  sourceSnapshotPath: string;
}

export interface ProposedKnowledgeIntake {
  intake: KnowledgeIntake;
  proposal: KnowledgeProposal;
}

const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const unix = (value: string) => value.split(path.sep).join("/");
const SHA256 = /^[a-f0-9]{64}$/;

async function regularFile(target: string, label: string): Promise<Stats> {
  const info = await lstat(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") throw new Error(`${label} does not exist: ${target}`);
    throw error;
  });
  if (info.isSymbolicLink()) throw new Error(`${label} must not be a symbolic link: ${target}`);
  if (!info.isFile()) throw new Error(`${label} is not a file: ${target}`);
  return info;
}

function decodeText(value: Uint8Array, source: string): string {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(value);
    if (text.includes("\0")) throw new Error("NUL");
    return text;
  } catch {
    throw new Error(`Intake source is not valid UTF-8 text: ${source}`);
  }
}

async function assertLocalStateDirectories(root: string): Promise<void> {
  for (const relative of [".lwc", path.join(".lwc", "drafts")]) {
    const target = path.join(root, relative);
    const info = await lstat(target).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (info?.isSymbolicLink()) throw new Error(`Intake local state must not cross a symbolic link: ${unix(relative)}`);
    if (info && !info.isDirectory()) throw new Error(`Intake local state path is not a directory: ${unix(relative)}`);
  }
}

function safeRelative(value: string, label: string): string {
  const clean = unix(value).replace(/^\.\//, "");
  if (!clean || path.posix.isAbsolute(clean) || clean.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Unsafe ${label} path: ${value}`);
  }
  return clean;
}

function draftTemplate(id: string, target: string, sourceHash: string): string {
  const title = path.posix.basename(target, ".md").replace(/[-_]+/g, " ").trim() || "Draft";
  return [
    "---",
    `title: ${JSON.stringify(title)}`,
    "type: note",
    `source: intake:${id}`,
    `source_sha256: ${sourceHash}`,
    "---",
    "",
    `# ${title}`,
    "",
    "<!-- Replace this placeholder with source-grounded knowledge before proposing. -->",
    "",
  ].join("\n");
}

export function parseKnowledgeIntake(value: unknown): KnowledgeIntake {
  if (!value || typeof value !== "object") throw new Error("Intake must be a JSON object");
  const intake = value as KnowledgeIntake;
  if (intake.schemaVersion !== 1 || !/^intake-[a-f0-9]{12}$/.test(intake.id ?? "") || !["draft", "proposed"].includes(intake.status)) {
    throw new Error("Unsupported or invalid intake schema");
  }
  if (!intake.rootName || !intake.createdAt || !intake.source || !intake.draft) throw new Error("Intake metadata is incomplete");
  if (intake.generator !== undefined && typeof intake.generator !== "string") throw new Error("Intake generator metadata is invalid");
  if (!intake.source.name || !intake.source.path || !SHA256.test(intake.source.sha256) || !Number.isSafeInteger(intake.source.bytes) || intake.source.bytes < 0) {
    throw new Error("Intake source metadata is invalid");
  }
  const snapshot = safeRelative(intake.source.snapshot, "source snapshot");
  if (!snapshot.startsWith(".source/")) throw new Error("Intake source snapshot must stay under .source/");
  knowledgeTargetPath("/intake-root", intake.draft.path);
  if (!SHA256.test(intake.draft.initialHash)) throw new Error("Intake initial draft hash is invalid");
  if (intake.status === "proposed" && (!/^proposal-[a-f0-9]{12}$/.test(intake.proposal?.id ?? "") || !intake.proposal?.file || !intake.proposal.proposedAt)) {
    throw new Error("Proposed intake is missing its proposal record");
  }
  if (intake.proposal && !/^\.lwc\/proposals\/proposal-[a-f0-9]{12}\.json$/.test(unix(intake.proposal.file))) {
    throw new Error("Intake proposal path is invalid");
  }
  return intake;
}

export async function readKnowledgeIntake(manifestPath: string): Promise<KnowledgeIntake> {
  try {
    await regularFile(path.resolve(manifestPath), "Intake manifest");
    return parseKnowledgeIntake(JSON.parse(await readFile(path.resolve(manifestPath), "utf8")));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`Intake is not valid JSON: ${manifestPath}`);
    throw error;
  }
}

async function findDuplicate(root: string, sourceHash: string, target: string): Promise<string | undefined> {
  const draftsRoot = path.join(root, ".lwc", "drafts");
  const files = await fg(["*/intake.json"], { cwd: draftsRoot, onlyFiles: true, followSymbolicLinks: false }).catch(() => []);
  for (const file of files.sort()) {
    try {
      const intake = parseKnowledgeIntake(JSON.parse(await readFile(path.join(draftsRoot, file), "utf8")));
      if (intake.source.sha256 === sourceHash && intake.draft.path === target) return intake.id;
    } catch {
      // Invalid manifests are isolated and can be surfaced by the future Drafts inbox.
    }
  }
  return undefined;
}

export async function createKnowledgeIntake(root: string, source: string, target: string, generator?: string, createdAt = new Date()): Promise<CreatedKnowledgeIntake> {
  const absoluteRoot = path.resolve(root);
  const rootInfo = await stat(absoluteRoot).catch(() => undefined);
  if (!rootInfo?.isDirectory()) throw new Error(`Wiki root is not a directory: ${absoluteRoot}`);
  await assertLocalStateDirectories(absoluteRoot);
  const absoluteSource = path.resolve(source);
  await regularFile(absoluteSource, "Intake source");
  if (!/\.(?:md|txt)$/i.test(absoluteSource)) throw new Error("Intake source must be a Markdown or text file (.md or .txt)");
  const relativeToRoot = unix(path.relative(absoluteRoot, absoluteSource));
  if (relativeToRoot === ".lwc" || relativeToRoot.startsWith(".lwc/")) throw new Error("Intake source must not come from generated .lwc state");
  const sourceBytes = await readFile(absoluteSource);
  decodeText(sourceBytes, absoluteSource);
  const sourceHash = hash(sourceBytes);
  const targetPath = unix(path.relative(absoluteRoot, knowledgeTargetPath(absoluteRoot, target)));
  const duplicate = await findDuplicate(absoluteRoot, sourceHash, targetPath);
  if (duplicate) throw new Error(`Duplicate intake source and target already exist: ${duplicate}`);

  const createdAtValue = createdAt.toISOString();
  const rootName = path.basename(absoluteRoot);
  const id = `intake-${hash(JSON.stringify({ rootName, sourceHash, targetPath, createdAt: createdAtValue })).slice(0, 12)}`;
  const intakeRoot = path.join(absoluteRoot, ".lwc", "drafts", id);
  const snapshotRelative = unix(path.join(".source", path.basename(absoluteSource)));
  const sourceSnapshotPath = path.join(intakeRoot, ...snapshotRelative.split("/"));
  const draftPath = path.join(intakeRoot, ...targetPath.split("/"));
  const manifestPath = path.join(intakeRoot, "intake.json");
  const template = draftTemplate(id, targetPath, sourceHash);
  const intake: KnowledgeIntake = {
    schemaVersion: 1,
    id,
    rootName,
    status: "draft",
    createdAt: createdAtValue,
    generator: generator?.trim() || undefined,
    source: {
      name: path.basename(absoluteSource),
      path: absoluteSource,
      snapshot: snapshotRelative,
      sha256: sourceHash,
      bytes: sourceBytes.byteLength,
    },
    draft: { path: targetPath, initialHash: hash(template) },
  };

  let createdRoot = false;
  try {
    await mkdir(path.dirname(intakeRoot), { recursive: true });
    await mkdir(intakeRoot);
    createdRoot = true;
    await mkdir(path.dirname(sourceSnapshotPath), { recursive: true });
    await mkdir(path.dirname(draftPath), { recursive: true });
    await writeFile(sourceSnapshotPath, sourceBytes, { flag: "wx" });
    await writeFile(draftPath, template, { encoding: "utf8", flag: "wx" });
    await writeFile(manifestPath, `${JSON.stringify(intake, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (createdRoot) await rm(intakeRoot, { recursive: true, force: true });
    throw error;
  }
  return { intake, manifestPath, draftPath, sourceSnapshotPath };
}

export async function proposeKnowledgeIntake(root: string, manifestPath: string, summary: string, proposedAt = new Date()): Promise<ProposedKnowledgeIntake> {
  const absoluteRoot = path.resolve(root);
  await assertLocalStateDirectories(absoluteRoot);
  const intake = await readKnowledgeIntake(manifestPath);
  if (intake.status !== "draft") throw new Error(`Only draft intake can become a proposal; current status is ${intake.status}`);
  if (intake.rootName !== path.basename(absoluteRoot)) throw new Error(`Intake root mismatch: expected ${intake.rootName}`);
  const intakeRoot = path.dirname(path.resolve(manifestPath));
  const expectedManifest = path.join(absoluteRoot, ".lwc", "drafts", intake.id, "intake.json");
  if (path.resolve(manifestPath) !== expectedManifest) throw new Error(`Intake manifest must stay under this Vault's .lwc/drafts directory: ${intake.id}`);
  const sourceInfo = await regularFile(intake.source.path, "Original intake source");
  const sourceBytes = await readFile(intake.source.path);
  if (sourceInfo.size !== intake.source.bytes || hash(sourceBytes) !== intake.source.sha256) throw new Error("Original intake source changed since draft creation");
  const snapshotPath = path.resolve(intakeRoot, ...safeRelative(intake.source.snapshot, "source snapshot").split("/"));
  await regularFile(snapshotPath, "Intake source snapshot");
  const snapshotBytes = await readFile(snapshotPath);
  if (hash(snapshotBytes) !== intake.source.sha256) throw new Error("Intake source snapshot integrity failed");
  const draftFiles = (await fg(["**/*.md"], { cwd: intakeRoot, onlyFiles: true, dot: false, followSymbolicLinks: false })).sort();
  if (draftFiles.length !== 1 || unix(draftFiles[0]) !== intake.draft.path) throw new Error(`Intake draft must contain only its declared target: ${intake.draft.path}`);
  const draftContent = await readFile(path.join(intakeRoot, ...intake.draft.path.split("/")), "utf8");
  if (hash(draftContent) === intake.draft.initialHash) throw new Error("Intake draft has not been edited by an Agent or author");
  const proposal = await createKnowledgeProposal(absoluteRoot, intakeRoot, summary, proposedAt, {
    id: intake.id,
    sourceName: intake.source.name,
    sourceHash: intake.source.sha256,
    target: intake.draft.path,
    generator: intake.generator,
  });
  const proposalFile = unix(path.join(".lwc", "proposals", `${proposal.id}.json`));
  return {
    proposal,
    intake: {
      ...intake,
      status: "proposed",
      proposal: { id: proposal.id, file: proposalFile, proposedAt: proposedAt.toISOString() },
    },
  };
}

export function intakeToMarkdown(value: unknown): string {
  const intake = parseKnowledgeIntake(value);
  const lines = [
    `# Knowledge intake ${intake.id}`,
    "",
    `- Status: **${intake.status}**`,
    `- Wiki root: \`${intake.rootName}\``,
    `- Created: \`${intake.createdAt}\``,
    `- Source: \`${intake.source.path}\``,
    `- Source SHA-256: \`${intake.source.sha256}\``,
    `- Source snapshot: \`${intake.source.snapshot}\``,
    `- Draft target: \`${intake.draft.path}\``,
    `- Generator: ${intake.generator ?? "not recorded"}`,
  ];
  if (intake.proposal) lines.push(`- Proposal: \`${intake.proposal.id}\` at \`${intake.proposal.file}\``);
  lines.push("", intake.status === "draft" ? "Edit the declared draft, then run `lwc intake propose`." : "Review the linked proposal before any formal Markdown is applied.", "");
  return lines.join("\n");
}
