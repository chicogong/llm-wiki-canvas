import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape, { type Core } from "cytoscape";
import type { NodeKind, WikiGraph, WikiNode } from "../core/types";

const KINDS: Array<{ value: "all" | NodeKind; label: string }> = [
  { value: "all", label: "全部" }, { value: "index", label: "索引" },
  { value: "concept", label: "概念" }, { value: "source", label: "来源" },
  { value: "note", label: "笔记" },
];
const KIND_LABEL: Record<NodeKind, string> = { index: "索引", concept: "概念", source: "来源", note: "笔记" };

function GraphStage({ graph, visibleIds, selectedId, onSelect }: {
  graph: WikiGraph; visibleIds: Set<string>; selectedId?: string; onSelect: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const cy = cytoscape({
      container: ref.current,
      elements: [
        ...graph.nodes.map((node) => ({ data: { id: node.id, label: node.title, kind: node.kind } })),
        ...graph.edges.map((edge) => ({ data: { id: edge.id, source: edge.source, target: edge.target, kind: edge.kind } })),
      ],
      style: [
        { selector: "node", style: { "background-color": "#f3efe4", "border-color": "#163a5f", "border-width": 2, label: "data(label)", color: "#15202b", "font-family": "Avenir Next, sans-serif", "font-size": "11px", "text-wrap": "wrap", "text-max-width": "92px", "text-valign": "bottom", "text-margin-y": 9, width: 24, height: 24 } },
        { selector: "node[kind = 'index']", style: { "background-color": "#f26b4a", width: 38, height: 38, "border-width": 4 } },
        { selector: "node[kind = 'concept']", style: { "background-color": "#e8c86a", shape: "diamond", width: 30, height: 30 } },
        { selector: "node[kind = 'source']", style: { "background-color": "#547a5a", shape: "round-rectangle" } },
        { selector: "edge", style: { width: 1.3, "line-color": "#8e9aa3", "target-arrow-color": "#8e9aa3", "target-arrow-shape": "triangle", "curve-style": "bezier", opacity: 0.65 } },
        { selector: ":selected", style: { "border-color": "#f26b4a", "border-width": 5, "underlay-color": "#f26b4a", "underlay-opacity": 0.12, "underlay-padding": 8 } },
        { selector: ".muted", style: { opacity: 0.08 } },
      ],
      layout: { name: "cose", animate: false, fit: true, padding: 58, nodeRepulsion: () => 14000, idealEdgeLength: () => 145, nodeOverlap: 28, componentSpacing: 110 },
      minZoom: 0.25,
      maxZoom: 2.4,
    });
    cy.on("tap", "node", (event) => onSelect(event.target.id()));
    cyRef.current = cy;
    return () => cy.destroy();
  }, [graph, onSelect]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().forEach((node) => { node.toggleClass("muted", !visibleIds.has(node.id())); });
    cy.edges().forEach((edge) => { edge.toggleClass("muted", !visibleIds.has(edge.source().id()) || !visibleIds.has(edge.target().id())); });
  }, [visibleIds]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !selectedId) return;
    cy.$(":selected").unselect();
    const node = cy.getElementById(selectedId);
    node.select();
    cy.animate({ center: { eles: node }, duration: 220 });
  }, [selectedId]);

  return <div ref={ref} className="graph-canvas" data-testid="graph-canvas" aria-label="Wiki 关系图" />;
}

export function App() {
  const [graph, setGraph] = useState<WikiGraph>();
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | NodeKind>("all");
  const [selectedId, setSelectedId] = useState<string>();

  useEffect(() => {
    const source = new URLSearchParams(location.search).get("graph") ?? "/graph.json";
    fetch(source).then((response) => {
      if (!response.ok) throw new Error(`无法读取图谱：HTTP ${response.status}`);
      if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error("图谱响应不是 JSON，请先运行 pnpm demo:build 或检查 graph 参数");
      }
      return response.json();
    }).then((value: WikiGraph) => {
      setGraph(value);
      setSelectedId(value.nodes.find((node) => node.kind === "index")?.id ?? value.nodes[0]?.id);
    }).catch((reason: Error) => setError(reason.message));
  }, []);

  const visibleIds = useMemo(() => new Set((graph?.nodes ?? []).filter((node) => {
    const text = `${node.title} ${node.path} ${node.tags.join(" ")} ${node.summary}`.toLowerCase();
    return (kind === "all" || node.kind === kind) && text.includes(query.trim().toLowerCase());
  }).map((node) => node.id)), [graph, kind, query]);
  const selected = graph?.nodes.find((node) => node.id === selectedId);
  const neighbors = useMemo(() => {
    if (!graph || !selected) return [] as WikiNode[];
    const ids = new Set(graph.edges.flatMap((edge) => edge.source === selected.id ? [edge.target] : edge.target === selected.id ? [edge.source] : []));
    return graph.nodes.filter((node) => ids.has(node.id));
  }, [graph, selected]);

  if (error) return <main className="status-screen"><p className="eyebrow">ATLAS LOAD ERROR</p><h1>图谱没有打开</h1><p>{error}</p><code>pnpm demo:build</code></main>;
  if (!graph) return <main className="status-screen"><p className="eyebrow">COMPILING LOCAL KNOWLEDGE</p><h1>正在展开图谱…</h1></main>;

  return <main className="atlas-shell">
    <header className="masthead">
      <div>
        <p className="eyebrow">LOCAL KNOWLEDGE ATLAS · PLATE 001</p>
        <h1>LLM Wiki <i>Canvas</i></h1>
      </div>
      <div className="edition"><span>本地只读</span><strong>{graph.rootName}</strong><small>{graph.generatedAt.slice(0, 10)}</small></div>
    </header>

    <section className="control-strip" aria-label="图谱控制">
      <label className="search-field"><span>检索坐标</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="标题、标签或路径" /></label>
      <div className="kind-tabs" role="group" aria-label="按类型筛选">
        {KINDS.map((item) => <button key={item.value} className={kind === item.value ? "active" : ""} onClick={() => setKind(item.value)}>{item.label}</button>)}
      </div>
      <dl className="stats">
        <div><dt>页面</dt><dd>{graph.stats.files}</dd></div><div><dt>关系</dt><dd>{graph.stats.links}</dd></div><div><dt>断链</dt><dd className={graph.stats.brokenLinks ? "warning" : ""}>{graph.stats.brokenLinks}</dd></div>
      </dl>
    </section>

    <section className="workspace">
      <div className="plate">
        <div className="plate-label"><span>关系视野</span><b>{visibleIds.size.toString().padStart(2, "0")} / {graph.nodes.length.toString().padStart(2, "0")}</b></div>
        <GraphStage graph={graph} visibleIds={visibleIds} selectedId={selectedId} onSelect={setSelectedId} />
        <div className="legend" aria-label="图例"><span><i className="dot index" />索引</span><span><i className="dot concept" />概念</span><span><i className="dot source" />来源</span><span><i className="dot note" />笔记</span></div>
      </div>
      <aside className="ledger" aria-live="polite">
        <div className="ledger-number">{selected ? graph.nodes.indexOf(selected) + 1 : "—"}</div>
        {selected ? <>
          <p className="eyebrow">{KIND_LABEL[selected.kind]} · EVIDENCE CARD</p>
          <h2>{selected.title}</h2>
          <p className="summary">{selected.summary || "此页面尚未写入摘要。"}</p>
          <dl className="metadata"><div><dt>路径</dt><dd>{selected.path}</dd></div><div><dt>字数</dt><dd>{selected.wordCount}</dd></div><div><dt>标签</dt><dd>{selected.tags.join(" · ") || "—"}</dd></div></dl>
          <div className="relations"><h3>相邻关系 <span>{neighbors.length}</span></h3>{neighbors.length ? neighbors.map((node) => <button key={node.id} onClick={() => setSelectedId(node.id)}><small>{KIND_LABEL[node.kind]}</small>{node.title}</button>) : <p>暂无直接关系</p>}</div>
        </> : <p>选择一个节点查看证据卡。</p>}
      </aside>
    </section>
    <footer><span>Markdown is truth.</span><span>Generated views are disposable.</span><span>Agent writes require review.</span></footer>
  </main>;
}
