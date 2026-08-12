export type NodeKind = "index" | "concept" | "source" | "note";

export type KnowledgeTrustTier = "unverified" | "machine-confirmed" | "human-reviewed";
export type KnowledgeLifecycleStatus = "draft" | "stable" | "deprecated";

export interface KnowledgeActorEvent {
  by: string;
  at?: string;
}

export interface KnowledgeSource {
  id?: string;
  resource: string;
  title?: string;
  author?: string;
  usageCount?: number;
  lastModified?: string;
  usageWindow?: { from?: string; to?: string };
}

export interface AttestedComputationContract {
  runtime?: string;
  parameters: Array<{ name: string; type: string; required?: boolean }>;
  computation?: string;
  executor?: { resource?: string; receipt: string[] };
  attester?: { resource?: string };
}

export interface KnowledgeTrust {
  tier: KnowledgeTrustTier;
  generated?: KnowledgeActorEvent;
  verified: KnowledgeActorEvent[];
  status: KnowledgeLifecycleStatus;
  staleAfter?: string;
  stale: boolean;
  sources: KnowledgeSource[];
}

export interface WikiNode {
  id: string;
  path: string;
  title: string;
  kind: NodeKind;
  type?: string;
  tags: string[];
  summary: string;
  headings: string[];
  wordCount: number;
  modifiedAt: string;
  source?: string;
  resource?: string;
  trust?: KnowledgeTrust;
  attestedComputation?: AttestedComputationContract;
  metadata?: Record<string, unknown>;
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
  okf?: {
    version: string;
    recognized: boolean;
    conformant: boolean;
    issues: Array<{ level: "error" | "warning"; code: string; path: string; message: string }>;
  };
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
