import type { Diagnostic, NodeKind, WikiGraph } from "./types.js";

export interface WikiReport {
  schemaVersion: 1;
  rootName: string;
  generatedAt: string;
  summary: {
    pages: number;
    relationships: number;
    connectedPages: number;
    pagesWithSource: number;
    words: number;
    errors: number;
    warnings: number;
  };
  pageKinds: Record<NodeKind, number>;
  diagnostics: Record<Diagnostic["code"], number>;
  mostConnected: Array<{
    path: string;
    title: string;
    incoming: number;
    outgoing: number;
    total: number;
  }>;
}

const diagnosticCodes: Diagnostic["code"][] = ["BROKEN_LINK", "AMBIGUOUS_LINK", "MISSING_TITLE", "ORPHAN_PAGE"];
const pageKinds: NodeKind[] = ["index", "concept", "source", "note"];

export function buildWikiReport(graph: WikiGraph, top = 5): WikiReport {
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  for (const edge of graph.edges) {
    outgoing.set(edge.source, (outgoing.get(edge.source) ?? 0) + 1);
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  }

  return {
    schemaVersion: 1,
    rootName: graph.rootName,
    generatedAt: graph.generatedAt,
    summary: {
      pages: graph.nodes.length,
      relationships: graph.edges.length,
      connectedPages: graph.nodes.length - graph.stats.orphanNodes,
      pagesWithSource: graph.nodes.filter((node) => Boolean(node.source)).length,
      words: graph.nodes.reduce((total, node) => total + node.wordCount, 0),
      errors: graph.diagnostics.filter((item) => item.level === "error").length,
      warnings: graph.diagnostics.filter((item) => item.level === "warning").length,
    },
    pageKinds: Object.fromEntries(pageKinds.map((kind) => [kind, graph.nodes.filter((node) => node.kind === kind).length])) as Record<NodeKind, number>,
    diagnostics: Object.fromEntries(diagnosticCodes.map((code) => [code, graph.diagnostics.filter((item) => item.code === code).length])) as Record<Diagnostic["code"], number>,
    mostConnected: graph.nodes
      .map((node) => {
        const inCount = incoming.get(node.id) ?? 0;
        const outCount = outgoing.get(node.id) ?? 0;
        return { path: node.path, title: node.title, incoming: inCount, outgoing: outCount, total: inCount + outCount };
      })
      .sort((a, b) => b.total - a.total || a.path.localeCompare(b.path))
      .slice(0, Math.max(0, top)),
  };
}

const cell = (value: string) => value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

export function reportToMarkdown(report: WikiReport): string {
  const total = report.summary.pages;
  const lines = [
    `# Wiki health report — ${cell(report.rootName)}`,
    "",
    `Generated at \`${report.generatedAt}\` from the local Markdown graph. This report uses observed counts, not an arbitrary health score.`,
    "",
    "## Verifiable snapshot",
    "",
    "| Signal | Result |",
    "| --- | ---: |",
    `| Markdown pages | ${total} |`,
    `| Resolved relationships | ${report.summary.relationships} |`,
    `| Connected pages | ${report.summary.connectedPages} / ${total} |`,
    `| Pages with source metadata | ${report.summary.pagesWithSource} / ${total} |`,
    `| Indexed words | ${report.summary.words} |`,
    `| Errors | ${report.summary.errors} |`,
    `| Warnings | ${report.summary.warnings} |`,
    "",
    "## Page types",
    "",
    "| Type | Pages |",
    "| --- | ---: |",
    ...pageKinds.map((kind) => `| ${kind} | ${report.pageKinds[kind]} |`),
    "",
    "## Most connected pages",
    "",
  ];

  if (report.mostConnected.length) {
    lines.push(
      "| Page | Incoming | Outgoing | Total | Path |",
      "| --- | ---: | ---: | ---: | --- |",
      ...report.mostConnected.map((item) => `| ${cell(item.title)} | ${item.incoming} | ${item.outgoing} | ${item.total} | \`${cell(item.path)}\` |`),
    );
  } else {
    lines.push("No Markdown pages were found.");
  }

  lines.push("", "## Diagnostics", "");
  if (report.summary.errors + report.summary.warnings === 0) {
    lines.push("No structural diagnostics were found.");
  } else {
    lines.push(
      "| Code | Count |",
      "| --- | ---: |",
      ...diagnosticCodes.filter((code) => report.diagnostics[code] > 0).map((code) => `| ${code} | ${report.diagnostics[code]} |`),
    );
  }

  lines.push("", "Use `lwc lint <vault>` for exact diagnostic paths and `lwc build <vault>` to regenerate the graph and Canvas.", "");
  return lines.join("\n");
}
