import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import {
  parseKnowledgeProposal,
  proposalDiff,
  type KnowledgeProposal,
  type ProposalDiffLine,
  type ProposalStatus,
} from "./proposal.js";

export interface ProposalInboxChange {
  path: string;
  operation: "create" | "update";
  baseHash: string | null;
  contentHash: string;
  diff: ProposalDiffLine[];
  targetState: "unchanged" | "matches-proposal" | "conflict";
  currentHash: string | null;
}

export interface ProposalTopologyLink {
  source: string;
  target: string;
  kind: "wikilink" | "markdown" | "embed";
}

export interface ProposalTopology {
  addedLinks: ProposalTopologyLink[];
  removedLinks: ProposalTopologyLink[];
  conflicts: string[];
}

export interface ProposalInboxItem {
  file: string;
  id: string;
  rootName: string;
  summary: string;
  status: ProposalStatus;
  createdAt: string;
  changes: ProposalInboxChange[];
  topology: ProposalTopology;
  intake?: KnowledgeProposal["intake"];
  review?: KnowledgeProposal["review"];
  rejection?: KnowledgeProposal["rejection"];
  application?: KnowledgeProposal["application"];
}

export interface ProposalInboxIssue {
  file: string;
  message: string;
}

export interface ProposalInbox {
  proposals: ProposalInboxItem[];
  issues: ProposalInboxIssue[];
}

const statusOrder: Record<ProposalStatus, number> = { proposed: 0, reviewed: 1, applied: 2, rejected: 3 };
const unix = (value: string) => value.split(path.sep).join("/");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function extractLinks(source: string, content: string): ProposalTopologyLink[] {
  const links: ProposalTopologyLink[] = [];
  const wiki = /(!)?\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  for (const match of content.matchAll(wiki)) {
    links.push({ source, target: match[2].trim(), kind: match[1] ? "embed" : "wikilink" });
  }
  const markdown = /(?<!!)\[[^\]]+\]\(\s*(?:<([^>]+)>|([^)]+?))\s*\)/g;
  for (const match of content.matchAll(markdown)) {
    const href = String(match[1] ?? match[2]).trim().replace(/\s+["'][^"']*["']$/, "");
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) continue;
    if (/\.md(?:#.*)?$/i.test(href)) links.push({ source, target: href.split("#")[0], kind: "markdown" });
  }
  return [...new Map(links.map((link) => [`${link.source}\u0000${link.kind}\u0000${link.target}`, link])).values()];
}

function difference(left: ProposalTopologyLink[], right: ProposalTopologyLink[]): ProposalTopologyLink[] {
  const keys = new Set(right.map((link) => `${link.source}\u0000${link.kind}\u0000${link.target}`));
  return left.filter((link) => !keys.has(`${link.source}\u0000${link.kind}\u0000${link.target}`));
}

async function currentContent(root: string, relative: string): Promise<string | null> {
  try {
    return await readFile(path.join(root, ...relative.split("/")), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function toInboxItem(root: string, file: string, proposal: KnowledgeProposal): Promise<ProposalInboxItem> {
  const changes = await Promise.all(proposal.changes.map(async (change) => {
    const current = await currentContent(root, change.path);
    const currentHash = current === null ? null : hash(current);
    return {
      path: change.path,
      operation: change.operation,
      baseHash: change.baseHash,
      contentHash: change.contentHash,
      diff: proposalDiff(change),
      targetState: currentHash === change.contentHash ? "matches-proposal" as const : currentHash === change.baseHash ? "unchanged" as const : "conflict" as const,
      currentHash,
    };
  }));
  const beforeLinks = proposal.changes.flatMap((change) => extractLinks(change.path, change.baseContent ?? ""));
  const afterLinks = proposal.changes.flatMap((change) => extractLinks(change.path, change.content));
  return {
    file: unix(path.join(".lwc", "proposals", file)),
    id: proposal.id,
    rootName: proposal.rootName,
    summary: proposal.summary,
    status: proposal.status,
    createdAt: proposal.createdAt,
    changes,
    topology: {
      addedLinks: difference(afterLinks, beforeLinks),
      removedLinks: difference(beforeLinks, afterLinks),
      conflicts: changes.filter((change) => change.targetState === "conflict").map((change) => change.path),
    },
    intake: proposal.intake,
    review: proposal.review,
    rejection: proposal.rejection,
    application: proposal.application,
  };
}

export async function readProposalInbox(root: string): Promise<ProposalInbox> {
  const absoluteRoot = path.resolve(root);
  const proposalsRoot = path.join(absoluteRoot, ".lwc", "proposals");
  const proposalsInfo = await stat(proposalsRoot).catch(() => undefined);
  if (!proposalsInfo) return { proposals: [], issues: [] };
  if (!proposalsInfo.isDirectory()) return { proposals: [], issues: [{ file: ".lwc/proposals", message: "Proposal inbox path is not a directory" }] };
  const files = await fg(["**/*.json"], { cwd: proposalsRoot, onlyFiles: true, dot: false, followSymbolicLinks: false });
  const proposals: ProposalInboxItem[] = [];
  const issues: ProposalInboxIssue[] = [];

  for (const file of files.sort()) {
    try {
      const proposal = parseKnowledgeProposal(JSON.parse(await readFile(path.join(proposalsRoot, file), "utf8")));
      if (proposal.rootName !== path.basename(absoluteRoot)) {
        throw new Error(`Proposal belongs to ${proposal.rootName}, not ${path.basename(absoluteRoot)}`);
      }
      proposals.push(await toInboxItem(absoluteRoot, file, proposal));
    } catch (error) {
      issues.push({ file: unix(path.join(".lwc", "proposals", file)), message: error instanceof Error ? error.message : String(error) });
    }
  }

  proposals.sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  return { proposals, issues };
}
