import type { JsonCanvas, JsonCanvasFileNode, JsonCanvasNode, LayoutSummary, WikiGraph } from "./types.js";

const COLORS: Record<string, string> = { index: "4", concept: "5", source: "6", note: "2" };

function generatedNode(node: JsonCanvasNode): node is JsonCanvasFileNode {
  return node.type === "file" && node.id.startsWith("node-");
}

export function summarizeCanvasLayout(graph: WikiGraph, previous?: JsonCanvas): LayoutSummary {
  const current = new Set(graph.nodes.map((node) => node.id));
  const old = (previous?.nodes ?? []).filter(generatedNode);
  return {
    preserved: old.filter((node) => current.has(node.id)).length,
    added: graph.nodes.filter((node) => !old.some((candidate) => candidate.id === node.id)).length,
    removed: old.filter((node) => !current.has(node.id)).map((node) => node.file).sort(),
    annotations: (previous?.nodes ?? []).filter((node) => !generatedNode(node)).length,
  };
}

export function graphToCanvas(graph: WikiGraph, previous?: JsonCanvas): JsonCanvas {
  const preserved = new Map((previous?.nodes ?? []).filter(generatedNode).map((node) => [node.id, node]));
  const annotations = (previous?.nodes ?? []).filter((node) => !generatedNode(node));
  const degree = new Map(graph.nodes.map((node) => [node.id, 0]));
  for (const edge of graph.edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  const sorted = [...graph.nodes].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.path.localeCompare(b.path));
  const newNodes = sorted.filter((node) => !preserved.has(node.id));
  const newNodeIndexes = new Map(newNodes.map((node, index) => [node.id, index]));
  const previousBounds = previous?.nodes.length ? {
    maxX: Math.max(...previous.nodes.map((node) => node.x + node.width)),
    minY: Math.min(...previous.nodes.map((node) => node.y)),
  } : undefined;
  const nodes: JsonCanvasNode[] = sorted.map((node, index) => {
    const old = preserved.get(node.id);
    const ring = index === 0 ? 0 : Math.floor((index - 1) / 8) + 1;
    const slot = index === 0 ? 0 : (index - 1) % 8;
    const angle = (slot / 8) * Math.PI * 2 - Math.PI / 2;
    const radius = ring * 520;
    const newIndex = newNodeIndexes.get(node.id) ?? -1;
    const appended = previousBounds && newIndex >= 0 ? {
      x: previousBounds.maxX + 160 + Math.floor(newIndex / 6) * 520,
      y: previousBounds.minY + (newIndex % 6) * 300,
    } : undefined;
    return {
      id: node.id,
      type: "file" as const,
      file: node.path,
      x: old?.x ?? appended?.x ?? Math.round(Math.cos(angle) * radius),
      y: old?.y ?? appended?.y ?? Math.round(Math.sin(angle) * radius),
      width: old?.width ?? 360,
      height: old?.height ?? 220,
      color: old?.color ?? COLORS[node.kind],
    };
  });
  const liveNodeIds = new Set([...nodes, ...annotations].map((node) => node.id));
  const annotationEdges = (previous?.edges ?? []).filter((edge) =>
    !edge.id.startsWith("edge-") && liveNodeIds.has(edge.fromNode) && liveNodeIds.has(edge.toNode));
  return {
    nodes: [...nodes, ...annotations],
    edges: [...graph.edges.map((edge) => ({
      id: edge.id,
      fromNode: edge.source,
      toNode: edge.target,
      fromEnd: "none" as const,
      toEnd: "arrow" as const,
      label: edge.label,
    })), ...annotationEdges],
  };
}
