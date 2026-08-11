import path from "node:path";
import type { Diagnostic, NodeKind, WikiGraph, WikiNode } from "./types.js";

export type FocusDirection = "both" | "incoming" | "outgoing";

export interface FocusOptions {
  depth?: 1 | 2;
  direction?: FocusDirection;
  kinds?: NodeKind[];
}

export interface FocusedGraph {
  graph: WikiGraph;
  focus: WikiNode;
}

const withoutMd = (value: string) => value.replace(/\.md$/i, "");
const normalized = (value: string) => withoutMd(value.replaceAll("\\", "/").replace(/^\.\//, "")).toLocaleLowerCase();

export function resolveFocusNode(graph: WikiGraph, query: string): WikiNode {
  const wanted = normalized(query.trim());
  if (!wanted) throw new Error("Focused diagram requires a non-empty --focus value");
  const matches = graph.nodes.filter((node) => {
    const keys = [node.id, node.path, path.posix.basename(node.path), node.title].map(normalized);
    return keys.includes(wanted);
  });
  if (matches.length === 0) throw new Error(`Focus page not found: ${query}`);
  if (matches.length > 1) throw new Error(`Focus page is ambiguous: ${query} matches ${matches.map((node) => node.path).join(", ")}`);
  return matches[0];
}

function diagnosticsFor(nodes: WikiNode[], diagnostics: Diagnostic[]): Diagnostic[] {
  const paths = new Set(nodes.map((node) => node.path));
  return diagnostics.filter((item) => paths.has(item.path));
}

export function selectFocusedGraph(graph: WikiGraph, query: string, options: FocusOptions = {}): FocusedGraph {
  const focus = resolveFocusNode(graph, query);
  const depth = options.depth ?? 1;
  const direction = options.direction ?? "both";
  if (![1, 2].includes(depth)) throw new Error(`Focused diagram depth must be 1 or 2: ${depth}`);
  if (!["both", "incoming", "outgoing"].includes(direction)) throw new Error(`Invalid focused diagram direction: ${direction}`);
  const kinds = options.kinds?.length ? new Set(options.kinds) : undefined;
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const selected = new Set([focus.id]);
  let frontier = new Set([focus.id]);

  for (let level = 0; level < depth; level += 1) {
    const next = new Set<string>();
    for (const edge of graph.edges) {
      const candidates: string[] = [];
      if ((direction === "both" || direction === "outgoing") && frontier.has(edge.source)) candidates.push(edge.target);
      if ((direction === "both" || direction === "incoming") && frontier.has(edge.target)) candidates.push(edge.source);
      for (const id of candidates) {
        const node = byId.get(id);
        if (!node || (kinds && !kinds.has(node.kind)) || selected.has(id)) continue;
        selected.add(id);
        next.add(id);
      }
    }
    frontier = next;
  }

  const nodes = graph.nodes.filter((node) => selected.has(node.id));
  const edges = graph.edges.filter((edge) => selected.has(edge.source) && selected.has(edge.target));
  const diagnostics = diagnosticsFor(nodes, graph.diagnostics);
  const connected = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  return {
    focus,
    graph: {
      ...graph,
      nodes,
      edges,
      diagnostics,
      stats: {
        files: nodes.length,
        links: edges.length,
        brokenLinks: diagnostics.filter((item) => item.code === "BROKEN_LINK").length,
        orphanNodes: nodes.filter((node) => !connected.has(node.id)).length,
      },
    },
  };
}
