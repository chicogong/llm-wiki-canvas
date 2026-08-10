import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import cytoscape, { type Core } from "cytoscape";
import type { NodeKind, WikiGraph, WikiNode } from "../core/types";

const KINDS: Array<{ value: "all" | NodeKind; label: string }> = [
  { value: "all", label: "All" },
  { value: "index", label: "Index" },
  { value: "concept", label: "Concept" },
  { value: "source", label: "Source" },
  { value: "note", label: "Note" },
];

const KIND_LABEL: Record<NodeKind, string> = {
  index: "Index",
  concept: "Concept",
  source: "Source",
  note: "Note",
};

function Icon({ children }: { children: ReactNode }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}

const mapIcon = <Icon><circle cx="12" cy="12" r="2.5" /><circle cx="5" cy="6" r="2" /><circle cx="19" cy="6" r="2" /><path d="m6.7 7 3.5 3.4M17.3 7l-3.5 3.4M12 14.5V20" /></Icon>;
const healthIcon = <Icon><path d="M4 12h4l2-6 4 12 2-6h4" /></Icon>;

function GraphStage({ graph, visibleIds, selectedId, onSelect }: {
  graph: WikiGraph;
  visibleIds: Set<string>;
  selectedId?: string;
  onSelect: (id: string) => void;
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
        { selector: "node", style: { "background-color": "#ffffff", "border-color": "#9ca6a0", "border-width": 1.5, label: "data(label)", color: "#27322c", "font-family": "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", "font-size": "11px", "font-weight": 600, "text-wrap": "wrap", "text-max-width": "116px", "text-valign": "bottom", "text-margin-y": 10, "text-background-color": "#f8faf7", "text-background-opacity": 0.92, "text-background-padding": "3px", width: 24, height: 24 } },
        { selector: "node[kind = 'index']", style: { "background-color": "#3159e8", "border-color": "#3159e8", shape: "round-rectangle", width: 42, height: 42, color: "#17201b", "font-size": "12px", "text-max-width": "148px" } },
        { selector: "node[kind = 'concept']", style: { "background-color": "#a9b9ff", "border-color": "#5570da", shape: "diamond", width: 31, height: 31 } },
        { selector: "node[kind = 'source']", style: { "background-color": "#f3c778", "border-color": "#bf7c18", shape: "round-rectangle", width: 32, height: 25 } },
        { selector: "node[kind = 'note']", style: { "background-color": "#ffffff", "border-color": "#77847d", shape: "ellipse" } },
        { selector: "edge", style: { width: 1.2, "line-color": "#b8c0bb", "target-arrow-color": "#9ca6a0", "target-arrow-shape": "triangle", "arrow-scale": 0.55, "curve-style": "bezier", opacity: 0.7 } },
        { selector: "edge.context", style: { width: 2, "line-color": "#3159e8", "target-arrow-color": "#3159e8", opacity: 0.95, "z-index": 20 } },
        { selector: "node.context", style: { "border-color": "#3159e8", "border-width": 2.5 } },
        { selector: ":selected", style: { "border-color": "#173fc5", "border-width": 3, "underlay-color": "#3159e8", "underlay-opacity": 0.11, "underlay-padding": 9 } },
        { selector: ".muted", style: { opacity: 0.08 } },
      ],
      layout: {
        name: "concentric",
        animate: false,
        fit: true,
        padding: 76,
        avoidOverlap: true,
        nodeDimensionsIncludeLabels: true,
        minNodeSpacing: 76,
        spacingFactor: 1.18,
        equidistant: true,
        startAngle: -Math.PI / 2,
        concentric: (node) => node.data("kind") === "index" ? 10 : 1,
        levelWidth: () => 5,
      },
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
    if (!cy) return;
    cy.$(":selected").unselect();
    cy.elements().removeClass("context");
    if (!selectedId) return;
    const node = cy.getElementById(selectedId);
    node.select();
    node.addClass("context");
    node.connectedEdges().addClass("context");
    node.neighborhood("node").addClass("context");
  }, [selectedId]);

  return <div ref={ref} className="graph-canvas" data-testid="graph-canvas" aria-label="Wiki relationship map" />;
}

function AppNavigation({ view, onView }: { view: "map" | "health"; onView: (view: "map" | "health") => void }) {
  return <nav className="app-nav" aria-label="Workspace views">
    <button className={view === "map" ? "active" : ""} onClick={() => onView("map")} aria-current={view === "map" ? "page" : undefined}>
      {mapIcon}<span>Map</span>
    </button>
    <button className={view === "health" ? "active" : ""} onClick={() => onView("health")} aria-current={view === "health" ? "page" : undefined}>
      {healthIcon}<span>Health</span>
    </button>
  </nav>;
}

function Inspector({ graph, selected, onSelect }: { graph: WikiGraph; selected?: WikiNode; onSelect: (id: string) => void }) {
  const relations = useMemo(() => {
    if (!selected) return [];
    return graph.edges.reduce<Array<{ node: WikiNode; direction: "in" | "out"; kind: "wikilink" | "markdown" | "embed" }>>((items, edge) => {
      if (edge.source === selected.id) {
        const node = graph.nodes.find((item) => item.id === edge.target);
        if (node) items.push({ node, direction: "out", kind: edge.kind });
      }
      if (edge.target === selected.id) {
        const node = graph.nodes.find((item) => item.id === edge.source);
        if (node) items.push({ node, direction: "in", kind: edge.kind });
      }
      return items;
    }, []);
  }, [graph, selected]);

  return <aside className="inspector" aria-live="polite">
    <div className="panel-heading"><span>Page details</span>{selected && <span className={`kind-badge ${selected.kind}`}>{KIND_LABEL[selected.kind]}</span>}</div>
    {selected ? <>
      <div className="page-title"><span className={`page-mark ${selected.kind}`} /><h2>{selected.title}</h2></div>
      <p className="summary">{selected.summary || "This page does not have a summary yet."}</p>
      <dl className="metadata">
        <div><dt>Path</dt><dd>{selected.path}</dd></div>
        <div><dt>Words</dt><dd>{selected.wordCount}</dd></div>
        <div><dt>Tags</dt><dd>{selected.tags.length ? selected.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>) : "—"}</dd></div>
      </dl>
      <section className="relations">
        <h3>Connections <span>{relations.length}</span></h3>
        {relations.length ? relations.map(({ node, direction, kind }, index) => <button key={`${node.id}-${index}`} onClick={() => onSelect(node.id)}>
          <span className={`relation-mark ${node.kind}`} />
          <span><strong>{node.title}</strong><small>{direction === "out" ? "Links to" : "Linked from"} · {kind}</small></span>
          <span className="relation-arrow">→</span>
        </button>) : <p className="empty-copy">No direct connections.</p>}
      </section>
    </> : <p className="empty-copy">Select a node to inspect its evidence and direct relationships.</p>}
  </aside>;
}

function MapView({ graph, selectedId, onSelect }: { graph: WikiGraph; selectedId?: string; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | NodeKind>("all");
  const visibleIds = useMemo(() => new Set(graph.nodes.filter((node) => {
    const text = `${node.title} ${node.path} ${node.tags.join(" ")} ${node.summary}`.toLowerCase();
    return (kind === "all" || node.kind === kind) && text.includes(query.trim().toLowerCase());
  }).map((node) => node.id)), [graph, kind, query]);
  const selected = graph.nodes.find((node) => node.id === selectedId);

  return <div className="map-view" data-testid="map-view">
    <section className="map-panel">
      <div className="map-toolbar">
        <label className="search-field">
          <Icon><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></Icon>
          <span className="sr-only">Search pages</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, tag, or path" />
          <kbd>⌘ K</kbd>
        </label>
        <div className="kind-tabs" role="group" aria-label="Filter by page type">
          {KINDS.map((item) => <button key={item.value} className={kind === item.value ? "active" : ""} onClick={() => setKind(item.value)}>{item.label}</button>)}
        </div>
        <span className="visible-count" aria-live="polite"><b>{visibleIds.size}</b> of {graph.nodes.length}</span>
      </div>
      <div className="canvas-frame">
        <GraphStage graph={graph} visibleIds={visibleIds} selectedId={selectedId} onSelect={onSelect} />
        <div className="legend" aria-label="Map legend">
          {KINDS.slice(1).map((item) => <span key={item.value}><i className={`dot ${item.value}`} />{item.label}</span>)}
        </div>
        <div className="canvas-help">Scroll to zoom · drag to pan</div>
      </div>
    </section>
    <Inspector graph={graph} selected={selected} onSelect={onSelect} />
  </div>;
}

function HealthView({ graph, onOpenPage }: { graph: WikiGraph; onOpenPage: (id: string) => void }) {
  const errors = graph.diagnostics.filter((item) => item.level === "error").length;
  const warnings = graph.diagnostics.filter((item) => item.level === "warning").length;
  const healthyPages = Math.max(0, graph.stats.files - graph.stats.orphanNodes);
  const kindCounts = KINDS.slice(1).map((item) => ({ ...item, count: graph.nodes.filter((node) => node.kind === item.value).length }));
  const hubs = graph.nodes.map((node) => ({ node, connections: graph.edges.filter((edge) => edge.source === node.id || edge.target === node.id).length }))
    .sort((a, b) => b.connections - a.connections || a.node.title.localeCompare(b.node.title)).slice(0, 5);

  return <div className="health-view" data-testid="health-view">
    <section className="health-intro">
      <div><p className="section-kicker">Vault health</p><h2>{errors === 0 ? "Knowledge you can trust." : "This vault needs attention."}</h2></div>
      <p>Every number below comes from the current Markdown scan. No model judgment and no hidden index.</p>
    </section>
    <section className="metric-grid" aria-label="Vault health metrics">
      <article><span>Pages</span><strong>{graph.stats.files}</strong><small>{healthyPages} connected</small></article>
      <article><span>Relationships</span><strong>{graph.stats.links}</strong><small>resolved links</small></article>
      <article className={graph.stats.brokenLinks ? "attention" : ""}><span>Broken links</span><strong>{graph.stats.brokenLinks}</strong><small>{graph.stats.brokenLinks ? "needs review" : "all targets resolve"}</small></article>
      <article className={graph.stats.orphanNodes ? "attention" : ""}><span>Orphan pages</span><strong>{graph.stats.orphanNodes}</strong><small>{graph.stats.orphanNodes ? "not connected" : "every page connected"}</small></article>
    </section>
    <div className="health-columns">
      <section className="health-card diagnostics-card">
        <div className="card-title"><div><p className="section-kicker">Diagnostics</p><h3>Scan results</h3></div><span>{errors} errors · {warnings} warnings</span></div>
        {graph.diagnostics.length ? <ul className="diagnostic-list">{graph.diagnostics.map((item, index) => <li key={`${item.path}-${item.code}-${index}`}>
          <span className={`diagnostic-level ${item.level}`} />
          <div><strong>{item.message}</strong><small>{item.path} · {item.code}</small></div>
        </li>)}</ul> : <div className="healthy-state"><span>✓</span><div><strong>No structural issues found</strong><p>All links resolve and every page participates in the graph.</p></div></div>}
      </section>
      <section className="health-card">
        <div className="card-title"><div><p className="section-kicker">Structure</p><h3>Page types</h3></div><span>{graph.nodes.length} total</span></div>
        <div className="kind-breakdown">{kindCounts.map((item) => <div key={item.value}><span><i className={`dot ${item.value}`} />{item.label}</span><b>{item.count}</b><i className="bar"><i style={{ width: `${graph.nodes.length ? item.count / graph.nodes.length * 100 : 0}%` }} /></i></div>)}</div>
      </section>
      <section className="health-card hubs-card">
        <div className="card-title"><div><p className="section-kicker">Navigation</p><h3>Most connected</h3></div><span>Top {hubs.length}</span></div>
        <div className="hub-list">{hubs.map(({ node, connections }, index) => <button key={node.id} onClick={() => onOpenPage(node.id)}>
          <span className="hub-rank">{String(index + 1).padStart(2, "0")}</span>
          <span><strong>{node.title}</strong><small>{KIND_LABEL[node.kind]} · {node.path}</small></span>
          <b>{connections}</b>
        </button>)}</div>
      </section>
    </div>
  </div>;
}

export function App() {
  const [graph, setGraph] = useState<WikiGraph>();
  const [error, setError] = useState<string>();
  const [view, setView] = useState<"map" | "health">("map");
  const [selectedId, setSelectedId] = useState<string>();
  const live = new URLSearchParams(location.search).get("live") === "1";

  useEffect(() => {
    const source = new URLSearchParams(location.search).get("graph") ?? "/graph.json";
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(source, { cache: "no-store" });
        if (!response.ok) throw new Error(`Unable to read graph: HTTP ${response.status}`);
        if (!response.headers.get("content-type")?.includes("application/json")) {
          throw new Error("Graph response is not JSON. Run pnpm demo:build or check the graph query parameter.");
        }
        const value = await response.json() as WikiGraph;
        if (!active) return;
        setGraph(value);
        setError(undefined);
        setSelectedId((current) => value.nodes.some((node) => node.id === current)
          ? current
          : value.nodes.find((node) => node.kind === "index")?.id ?? value.nodes[0]?.id);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      }
    };
    void load();
    const events = live ? new EventSource("/__lwc/events") : undefined;
    events?.addEventListener("graph", () => { void load(); });
    return () => { active = false; events?.close(); };
  }, [live]);

  if (error) return <main className="status-screen"><div className="status-mark">!</div><p className="section-kicker">Graph unavailable</p><h1>The knowledge map could not open.</h1><p>{error}</p><code>pnpm demo:build</code></main>;
  if (!graph) return <main className="status-screen"><div className="loading-mark" /><p className="section-kicker">Reading local knowledge</p><h1>Opening workspace…</h1></main>;

  const switchToPage = (id: string) => { setSelectedId(id); setView("map"); };

  return <main className="workbench-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">L</span><div><strong>LLM Wiki Canvas</strong><small>Local knowledge workbench</small></div></div>
      <div className="vault-label"><span>Workspace</span><strong>{graph.rootName}</strong></div>
      <AppNavigation view={view} onView={setView} />
      <div className="sidebar-note"><span className="status-dot" /><div><strong>{live ? "Watching locally" : "Local only"}</strong><small>{live ? "Refreshes when Markdown changes" : "Markdown stays on this machine"}</small></div></div>
    </aside>

    <section className="workbench">
      <header className="topbar">
        <div className="mobile-brand"><span className="brand-mark">L</span><strong>{graph.rootName}</strong></div>
        <div className="breadcrumb"><span>{graph.rootName}</span><b>/</b><strong>{view === "map" ? "Knowledge map" : "Vault health"}</strong></div>
        <div className="topbar-meta"><span className="status-dot" />{live ? "Live" : "Generated"} {graph.generatedAt.slice(0, 10)}</div>
      </header>
      <div className="mobile-nav"><AppNavigation view={view} onView={setView} /></div>
      {view === "map" ? <MapView graph={graph} selectedId={selectedId} onSelect={setSelectedId} /> : <HealthView graph={graph} onOpenPage={switchToPage} />}
    </section>
  </main>;
}
