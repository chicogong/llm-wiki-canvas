export type NodeKind = "index" | "concept" | "source" | "note";

export interface WikiNode {
  id: string;
  path: string;
  title: string;
  kind: NodeKind;
  tags: string[];
  summary: string;
  headings: string[];
  wordCount: number;
  modifiedAt: string;
  source?: string;
}

export interface WikiEdge {
  id: string;
  source: string;
  target: string;
  kind: "wikilink" | "markdown" | "embed";
  label?: string;
}

export interface Diagnostic {
  level: "error" | "warning";
  code: "BROKEN_LINK" | "AMBIGUOUS_LINK" | "MISSING_TITLE" | "ORPHAN_PAGE";
  path: string;
  message: string;
  target?: string;
}

export interface WikiGraph {
  schemaVersion: 1;
  rootName: string;
  generatedAt: string;
  nodes: WikiNode[];
  edges: WikiEdge[];
  diagnostics: Diagnostic[];
  stats: {
    files: number;
    links: number;
    brokenLinks: number;
    orphanNodes: number;
  };
}

export interface JsonCanvas {
  nodes: Array<{
    id: string;
    type: "file";
    file: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color?: string;
  }>;
  edges: Array<{
    id: string;
    fromNode: string;
    toNode: string;
    fromEnd?: "arrow" | "none";
    toEnd?: "arrow" | "none";
    label?: string;
  }>;
}
