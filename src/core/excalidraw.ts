import { createHash } from "node:crypto";
import { graphToCanvas } from "./canvas.js";
import type { ExcalidrawDocument, ExcalidrawElement, WikiGraph } from "./types.js";

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

export function graphToExcalidraw(graph: WikiGraph): ExcalidrawDocument {
  const layout = graphToCanvas(graph);
  const rawMinX = Math.min(...layout.nodes.map((node) => node.x), 0);
  const rawMinY = Math.min(...layout.nodes.map((node) => node.y), 0);
  const layoutScale = 0.72;
  const positions = new Map(layout.nodes.map((node) => [node.id, {
    x: Math.round((node.x - rawMinX) * layoutScale + 80),
    y: Math.round((node.y - rawMinY) * layoutScale + 90),
  }]));
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
    elements.push({
      ...base(shapeId, "rectangle", position.x, position.y, NODE_WIDTH, NODE_HEIGHT),
      strokeColor: colors.stroke,
      backgroundColor: colors.background,
      boundElements: graph.edges.filter((edge) => edge.source === node.id || edge.target === node.id).map((edge) => ({ id: `x-${edge.id}`, type: "arrow" })),
      customData: { lwc: { nodeId: node.id, path: node.path, kind: node.kind } },
    });
    const title = wrap(node.title);
    elements.push(textElement(`xt-${node.id}`, title, position.x + 18, position.y + 18, 21, "#17201b"));
    elements.push(textElement(`xp-${node.id}`, node.path, position.x + 18, position.y + 88, 11, colors.stroke));
  }

  return {
    type: "excalidraw",
    version: 2,
    source: SOURCE,
    elements,
    appState: {
      gridSize: 20,
      viewBackgroundColor: "#f8faf7",
      scrollX: Math.round(720 / initialZoom - centerX),
      scrollY: Math.round(450 / initialZoom - centerY),
      zoom: { value: initialZoom },
    },
    files: {},
  };
}
