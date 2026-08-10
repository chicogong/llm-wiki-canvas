import type { JsonCanvas, WikiGraph } from "./types.js";

const COLORS: Record<string, string> = { index: "4", concept: "5", source: "6", note: "2" };

export function graphToCanvas(graph: WikiGraph, previous?: JsonCanvas): JsonCanvas {
  const preserved = new Map((previous?.nodes ?? []).map((node) => [node.id, node]));
  const degree = new Map(graph.nodes.map((node) => [node.id, 0]));
  for (const edge of graph.edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  const sorted = [...graph.nodes].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.path.localeCompare(b.path));
  const nodes = sorted.map((node, index) => {
    const old = preserved.get(node.id);
    const ring = index === 0 ? 0 : Math.floor((index - 1) / 8) + 1;
    const slot = index === 0 ? 0 : (index - 1) % 8;
    const angle = (slot / 8) * Math.PI * 2 - Math.PI / 2;
    const radius = ring * 520;
    return {
      id: node.id,
      type: "file" as const,
      file: node.path,
      x: old?.x ?? Math.round(Math.cos(angle) * radius),
      y: old?.y ?? Math.round(Math.sin(angle) * radius),
      width: old?.width ?? 360,
      height: old?.height ?? 220,
      color: old?.color ?? COLORS[node.kind],
    };
  });
  return {
    nodes,
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      fromNode: edge.source,
      toNode: edge.target,
      fromEnd: "none",
      toEnd: "arrow",
      label: edge.label,
    })),
  };
}
