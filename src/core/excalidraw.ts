import { createHash } from "node:crypto";
import { graphToCanvas } from "./canvas.js";
import type { ExcalidrawDocument, ExcalidrawElement, LayoutSummary, WikiGraph } from "./types.js";

const SOURCE = "https://github.com/chicogong/llm-wiki-canvas";
const NODE_WIDTH = 300;
const NODE_HEIGHT = 124;
const COLORS = {
  index: { stroke: "#3159e8", background: "#e8edff" },
  concept: { stroke: "#6477d8", background: "#edf0ff" },
  source: { stroke: "#c47c16", background: "#fff2d9" },
  note: { stroke: "#66716a", background: "#f5f7f4" },
} as const;

function integer(id: string, salt: string): number {
  return Number.parseInt(createHash("sha256").update(`${salt}:${id}`).digest("hex").slice(0, 7), 16) || 1;
}

function base(id: string, type: string, x: number, y: number, width: number, height: number): ExcalidrawElement {
  return {
    id,
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: "#17201b",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: type === "rectangle" ? { type: 3 } : null,
    seed: integer(id, "seed"),
    version: 1,
    versionNonce: integer(id, "version"),
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
  };
}

function wrap(text: string, limit = 25): string {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line && `${line} ${word}`.length > limit) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.join("\n") || text;
}

function textElement(id: string, text: string, x: number, y: number, fontSize: number, color: string): ExcalidrawElement {
  const lines = text.split("\n");
  const width = Math.max(...lines.map((line) => line.length), 1) * fontSize * 0.58;
  const height = lines.length * fontSize * 1.25;
  return {
    ...base(id, "text", x, y, Math.round(width), Math.round(height)),
    strokeColor: color,
    fontSize,
    fontFamily: 1,
    text,
    originalText: text,
    textAlign: "left",
    verticalAlign: "top",
    containerId: null,
    autoResize: true,
    lineHeight: 1.25,
  };
}

function lwcData(element: ExcalidrawElement): Record<string, unknown> | undefined {
  const customData = element.customData;
  if (!customData || typeof customData !== "object") return undefined;
  const lwc = (customData as Record<string, unknown>).lwc;
  return lwc && typeof lwc === "object" ? lwc as Record<string, unknown> : undefined;
}

function generatedElement(element: ExcalidrawElement): boolean {
  return Boolean(lwcData(element)) || element.id.startsWith("xt-node-") || element.id.startsWith("xp-node-");
}

export function summarizeExcalidrawLayout(graph: WikiGraph, previous?: ExcalidrawDocument): LayoutSummary {
  const current = new Set(graph.nodes.map((node) => node.id));
  const oldNodes = (previous?.elements ?? []).flatMap((element) => {
    const data = lwcData(element);
    return typeof data?.nodeId === "string" ? [{ id: data.nodeId, path: typeof data.path === "string" ? data.path : data.nodeId }] : [];
  });
  const oldIds = new Set(oldNodes.map((node) => node.id));
  return {
    preserved: oldNodes.filter((node) => current.has(node.id)).length,
    added: graph.nodes.filter((node) => !oldIds.has(node.id)).length,
    removed: oldNodes.filter((node) => !current.has(node.id)).map((node) => node.path).sort(),
    annotations: (previous?.elements ?? []).filter((element) => !generatedElement(element)).length,
  };
}

function preservePosition(element: ExcalidrawElement, previous: Map<string, ExcalidrawElement>): ExcalidrawElement {
  const old = previous.get(element.id);
  return old ? { ...element, x: old.x, y: old.y } : element;
}

export function graphToExcalidraw(graph: WikiGraph, options: { focusId?: string; previous?: ExcalidrawDocument } = {}): ExcalidrawDocument {
  const layout = graphToCanvas(graph);
  const rawMinX = Math.min(...layout.nodes.map((node) => node.x), 0);
  const rawMinY = Math.min(...layout.nodes.map((node) => node.y), 0);
  const layoutScale = 0.72;
  const defaultPositions = new Map(layout.nodes.map((node) => [node.id, {
    x: Math.round((node.x - rawMinX) * layoutScale + 80),
    y: Math.round((node.y - rawMinY) * layoutScale + 90),
  }]));
  const previousElements = new Map((options.previous?.elements ?? []).map((element) => [element.id, element]));
  const previousBounds = options.previous?.elements.length ? {
    maxX: Math.max(...options.previous.elements.filter((element) => !element.isDeleted).map((element) => element.x + element.width), 0),
    minY: Math.min(...options.previous.elements.filter((element) => !element.isDeleted).map((element) => element.y), 0),
  } : undefined;
  let added = 0;
  const positions = new Map(graph.nodes.map((node) => {
    const old = previousElements.get(`x-${node.id}`);
    const fallback = defaultPositions.get(node.id) ?? { x: 80, y: 90 };
    if (old) return [node.id, { x: old.x, y: old.y }];
    if (!previousBounds) return [node.id, fallback];
    const index = added++;
    return [node.id, { x: previousBounds.maxX + 120 + Math.floor(index / 6) * 420, y: previousBounds.minY + (index % 6) * 190 }];
  }));
  const elements: ExcalidrawElement[] = [];
  const sceneBounds = [...positions.values()].reduce((bounds, position) => ({
    minX: Math.min(bounds.minX, position.x),
    minY: Math.min(bounds.minY, position.y),
    maxX: Math.max(bounds.maxX, position.x + NODE_WIDTH),
    maxY: Math.max(bounds.maxY, position.y + NODE_HEIGHT),
  }), { minX: 0, minY: 0, maxX: NODE_WIDTH, maxY: NODE_HEIGHT });
  const initialZoom = 0.82;
  const centerX = (sceneBounds.minX + sceneBounds.maxX) / 2;
  const centerY = (sceneBounds.minY + sceneBounds.maxY) / 2;

  for (const edge of graph.edges) {
    const source = positions.get(edge.source);
    const target = positions.get(edge.target);
    if (!source || !target) continue;
    const x = source.x + NODE_WIDTH / 2;
    const y = source.y + NODE_HEIGHT / 2;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    elements.push({
      ...base(`x-${edge.id}`, "arrow", x, y, Math.abs(dx), Math.abs(dy)),
      strokeColor: edge.kind === "embed" ? "#c47c16" : "#66716a",
      strokeWidth: edge.kind === "wikilink" ? 2 : 1,
      strokeStyle: edge.kind === "markdown" ? "dashed" : edge.kind === "embed" ? "dotted" : "solid",
      points: [[0, 0], [dx, dy]],
      lastCommittedPoint: null,
      startBinding: { elementId: `x-${edge.source}`, focus: 0, gap: 8 },
      endBinding: { elementId: `x-${edge.target}`, focus: 0, gap: 8 },
      startArrowhead: null,
      endArrowhead: "arrow",
      elbowed: false,
      customData: { lwc: { edgeId: edge.id, kind: edge.kind, label: edge.label } },
    });
  }

  for (const node of graph.nodes) {
    const position = positions.get(node.id);
    if (!position) continue;
    const colors = COLORS[node.kind];
    const shapeId = `x-${node.id}`;
    const focused = node.id === options.focusId;
    elements.push(preservePosition({
      ...base(shapeId, "rectangle", position.x, position.y, NODE_WIDTH, NODE_HEIGHT),
      strokeColor: focused ? "#173fc5" : colors.stroke,
      backgroundColor: focused ? "#dfe6ff" : colors.background,
      strokeWidth: focused ? 4 : 2,
      boundElements: graph.edges.filter((edge) => edge.source === node.id || edge.target === node.id).map((edge) => ({ id: `x-${edge.id}`, type: "arrow" })),
      customData: { lwc: { nodeId: node.id, path: node.path, kind: node.kind, ...(focused ? { focus: true } : {}) } },
    }, previousElements));
    const title = wrap(node.title);
    elements.push(preservePosition(textElement(`xt-${node.id}`, title, position.x + 18, position.y + 18, 21, "#17201b"), previousElements));
    elements.push(preservePosition(textElement(`xp-${node.id}`, node.path, position.x + 18, position.y + 88, 11, colors.stroke), previousElements));
  }

  elements.push(...(options.previous?.elements ?? []).filter((element) => !generatedElement(element)));

  return {
    type: "excalidraw",
    version: 2,
    source: SOURCE,
    elements,
    appState: {
      ...options.previous?.appState,
      gridSize: options.previous?.appState.gridSize ?? 20,
      viewBackgroundColor: options.previous?.appState.viewBackgroundColor ?? "#f8faf7",
      scrollX: options.previous?.appState.scrollX ?? Math.round(720 / initialZoom - centerX),
      scrollY: options.previous?.appState.scrollY ?? Math.round(450 / initialZoom - centerY),
      zoom: options.previous?.appState.zoom ?? { value: initialZoom },
    },
    files: options.previous?.files ?? {},
  };
}
