import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import { jsonSafeMetadata, parseMarkdown } from "./frontmatter.js";
import { checkOkfBundle, parseAttestedComputation, parseKnowledgeTrust } from "./okf.js";
import type { Diagnostic, NodeKind, WikiEdge, WikiGraph, WikiNode } from "./types.js";

type Draft = WikiNode & { rawLinks: RawLink[]; missingTitle: boolean };
type RawLink = { target: string; label?: string; kind: WikiEdge["kind"] };

const unix = (value: string) => value.split(path.sep).join("/");
const withoutMd = (value: string) => value.replace(/\.md$/i, "").replace(/\/$/, "");
function safeDecode(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

const normalizedKey = (value: string) => safeDecode(withoutMd(unix(value))).replace(/^\.\//, "").replace(/^\/+/, "").toLocaleLowerCase();
const stableId = (prefix: string, value: string) => `${prefix}-${createHash("sha1").update(value).digest("hex").slice(0, 12)}`;

function firstParagraph(content: string): string {
  return content
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/!?(?:\[\[[^\]]+\]\]|\[[^\]]+\]\([^\)]+\))/g, "")
    .split(/\n\s*\n/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .find(Boolean)
    ?.slice(0, 220) ?? "";
}

function nodeKind(relativePath: string, data: Record<string, unknown>): NodeKind {
  const explicit = String(data.type ?? data.kind ?? "").toLowerCase();
  if (["index", "concept", "source", "note"].includes(explicit)) return explicit as NodeKind;
  if (/^(index|home|readme)\.md$/i.test(path.basename(relativePath))) return "index";
  if (/^(sources|references)\//i.test(relativePath)) return "source";
  if (relativePath.toLowerCase().startsWith("concepts/")) return "concept";
  if (explicit) return "concept";
  return "note";
}

function extractLinks(content: string): RawLink[] {
  const links: RawLink[] = [];
  const wiki = /(!)?\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g;
  for (const match of content.matchAll(wiki)) {
    links.push({ target: match[2].trim(), label: match[3]?.trim(), kind: match[1] ? "embed" : "wikilink" });
  }
  const markdown = /(?<!!)\[([^\]]+)\]\(\s*(?:<([^>]+)>|([^)]+?))\s*\)/g;
  for (const match of content.matchAll(markdown)) {
    const href = String(match[2] ?? match[3]).trim().replace(/\s+["'][^"']*["']$/, "");
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) continue;
    if (!/\.md(?:#.*)?$/i.test(href)) continue;
    links.push({ target: href.split("#")[0], label: match[1].trim(), kind: "markdown" });
  }
  return links;
}

export async function buildGraph(root: string, now = new Date(), fixedModifiedAt?: Date): Promise<WikiGraph> {
  const absoluteRoot = path.resolve(root);
  const rootInfo = await stat(absoluteRoot).catch(() => undefined);
  if (!rootInfo?.isDirectory()) throw new Error(`Wiki root is not a directory: ${absoluteRoot}`);
  const okfVersion = await readFile(path.join(absoluteRoot, "index.md"), "utf8")
    .then((raw) => parseMarkdown(raw).data.okf_version)
    .catch(() => undefined);
  const declaredOkfVersion = okfVersion === undefined ? undefined : String(okfVersion);
  const files = await fg(["**/*.md"], {
    cwd: absoluteRoot,
    onlyFiles: true,
    dot: false,
    ignore: [".git/**", ".lwc/**", ".agents/**", ".claude/**", ".qoder/**", "node_modules/**", "**/AGENTS.md", "**/CLAUDE.md"],
  });
  const drafts: Draft[] = await Promise.all(files.sort().map(async (relative) => {
    const absolute = path.join(absoluteRoot, relative);
    const [raw, info] = await Promise.all([readFile(absolute, "utf8"), stat(absolute)]);
    const parsed = parseMarkdown(raw);
    const heading = parsed.content.match(/^#\s+(.+)$/m)?.[1]?.trim();
    const title = String(parsed.data.title ?? heading ?? path.basename(relative, ".md"));
    const rawTags = parsed.data.tags ?? [];
    const tags = Array.isArray(rawTags) ? rawTags.map(String) : String(rawTags).split(",").map((tag) => tag.trim()).filter(Boolean);
    const cleanPath = unix(relative);
    const rawType = String(parsed.data.type ?? parsed.data.kind ?? "").trim();
    const okfDocument = declaredOkfVersion !== undefined && !/^(index|log)\.md$/i.test(path.basename(cleanPath));
    const kind = nodeKind(cleanPath, parsed.data);
    return {
      id: stableId("node", normalizedKey(cleanPath)),
      path: cleanPath,
      title,
      kind,
      type: rawType || kind,
      tags,
      summary: String(parsed.data.summary ?? parsed.data.description ?? firstParagraph(parsed.content)),
      headings: [...parsed.content.matchAll(/^#{2,6}\s+(.+)$/gm)].map((match) => match[1].trim()),
      wordCount: parsed.content.trim().split(/\s+|(?<=[\u4e00-\u9fff])/).filter(Boolean).length,
      modifiedAt: (fixedModifiedAt ?? info.mtime).toISOString(),
      source: parsed.data.source ? String(parsed.data.source) : undefined,
      resource: parsed.data.resource ? String(parsed.data.resource) : undefined,
      trust: parseKnowledgeTrust(parsed.data, now, okfDocument),
      attestedComputation: parseAttestedComputation(parsed.data),
      metadata: jsonSafeMetadata(parsed.data),
      rawLinks: extractLinks(parsed.content),
      missingTitle: !parsed.data.title && !heading,
    };
  }));

  const byKey = new Map<string, Draft[]>();
  for (const draft of drafts) {
    const keys = [normalizedKey(draft.path), normalizedKey(path.basename(draft.path)), normalizedKey(draft.title)];
    for (const key of new Set(keys)) byKey.set(key, [...(byKey.get(key) ?? []), draft]);
  }

  const edges: WikiEdge[] = [];
  const diagnostics: Diagnostic[] = drafts.filter((draft) => draft.missingTitle).map((draft) => ({
    level: "warning",
    code: "MISSING_TITLE",
    path: draft.path,
    message: "Page has neither a frontmatter title nor an H1 heading",
  }));
  for (const source of drafts) {
    for (const link of source.rawLinks) {
      const relativeCandidate = link.target.startsWith("/") ? normalizedKey(link.target) : normalizedKey(path.join(path.dirname(source.path), link.target));
      const directCandidate = normalizedKey(link.target);
      const candidates = byKey.get(relativeCandidate) ?? byKey.get(directCandidate) ?? byKey.get(normalizedKey(path.basename(link.target))) ?? [];
      const unique = [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()];
      if (unique.length === 0) {
        diagnostics.push({ level: "error", code: "BROKEN_LINK", path: source.path, target: link.target, message: `Unresolved link: ${link.target}` });
        continue;
      }
      if (unique.length > 1) {
        diagnostics.push({ level: "warning", code: "AMBIGUOUS_LINK", path: source.path, target: link.target, message: `Ambiguous link resolves to ${unique.length} files: ${link.target}` });
        continue;
      }
      const target = unique[0];
      edges.push({
        id: stableId("edge", `${source.id}:${target.id}:${link.kind}:${link.label ?? ""}`),
        source: source.id,
        target: target.id,
        kind: link.kind,
        label: link.label,
      });
    }
  }

  const uniqueEdges = [...new Map(edges.map((edge) => [edge.id, edge])).values()];
  const connected = new Set(uniqueEdges.flatMap((edge) => [edge.source, edge.target]));
  const nodes = drafts.map(({ rawLinks: _rawLinks, missingTitle: _missingTitle, ...node }) => node);
  for (const node of nodes.filter((item) => !connected.has(item.id))) {
    diagnostics.push({ level: "warning", code: "ORPHAN_PAGE", path: node.path, message: "Page has no resolved incoming or outgoing relationships" });
  }
  const okfCheck = declaredOkfVersion === undefined ? undefined : await checkOkfBundle(absoluteRoot);
  return {
    schemaVersion: 1,
    rootName: path.basename(absoluteRoot),
    generatedAt: now.toISOString(),
    okf: declaredOkfVersion === undefined ? undefined : {
      version: declaredOkfVersion,
      recognized: declaredOkfVersion === "0.2",
      conformant: okfCheck?.conformant ?? false,
      issues: okfCheck?.issues ?? [],
    },
    nodes,
    edges: uniqueEdges,
    diagnostics,
    stats: {
      files: nodes.length,
      links: uniqueEdges.length,
      brokenLinks: diagnostics.filter((item) => item.code === "BROKEN_LINK").length,
      orphanNodes: nodes.filter((node) => !connected.has(node.id)).length,
    },
  };
}
