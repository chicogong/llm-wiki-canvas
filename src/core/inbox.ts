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
}

export interface ProposalInboxItem {
  file: string;
  id: string;
  rootName: string;
  summary: string;
  status: ProposalStatus;
  createdAt: string;
  changes: ProposalInboxChange[];
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

function toInboxItem(file: string, proposal: KnowledgeProposal): ProposalInboxItem {
  return {
    file: unix(path.join(".lwc", "proposals", file)),
    id: proposal.id,
    rootName: proposal.rootName,
    summary: proposal.summary,
    status: proposal.status,
    createdAt: proposal.createdAt,
    changes: proposal.changes.map((change) => ({
      path: change.path,
      operation: change.operation,
      baseHash: change.baseHash,
      contentHash: change.contentHash,
      diff: proposalDiff(change),
    })),
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
      proposals.push(toInboxItem(file, proposal));
    } catch (error) {
      issues.push({ file: unix(path.join(".lwc", "proposals", file)), message: error instanceof Error ? error.message : String(error) });
    }
  }

  proposals.sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  return { proposals, issues };
}
