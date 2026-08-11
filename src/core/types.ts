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

interface JsonCanvasNodeBase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
}

export type JsonCanvasFileNode = JsonCanvasNodeBase & { type: "file"; file: string; subpath?: string };

export type JsonCanvasNode =
  | JsonCanvasFileNode
  | (JsonCanvasNodeBase & (
    | { type: "text"; text: string }
  | { type: "link"; url: string }
  | { type: "group"; label?: string; background?: string; backgroundStyle?: "cover" | "ratio" | "repeat" }
  ));

export interface JsonCanvas {
  nodes: JsonCanvasNode[];
  edges: Array<{
    id: string;
    fromNode: string;
    toNode: string;
    fromSide?: "top" | "right" | "bottom" | "left";
    fromEnd?: "arrow" | "none";
    toSide?: "top" | "right" | "bottom" | "left";
    toEnd?: "arrow" | "none";
    color?: string;
    label?: string;
  }>;
}

export interface LayoutSummary {
  preserved: number;
  added: number;
  removed: string[];
  annotations: number;
}

export interface ExcalidrawElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  [key: string]: unknown;
}

export interface ExcalidrawDocument {
  type: "excalidraw";
  version: 2;
  source: string;
  elements: ExcalidrawElement[];
  appState: {
    gridSize: number;
    viewBackgroundColor: string;
    scrollX: number;
    scrollY: number;
    zoom: { value: number };
    [key: string]: unknown;
  };
  files: Record<string, unknown>;
}
