import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import cytoscape, { type Core } from "cytoscape";
import type { DraftInbox, DraftInboxItem, DraftInboxState, EvidenceState, ProposalInbox, ProposalInboxItem, ProposalStatus } from "../core/index.js";
import { latestVerification } from "../core/trust.js";
import type { NodeKind, WikiGraph, WikiNode } from "../core/types";

type WorkbenchView = "map" | "health" | "drafts" | "changes";

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
const draftsIcon = <Icon><path d="M7 3h8l3 3v15H7z" /><path d="M15 3v4h4M10 11h5M10 15h5" /><path d="M4 7v13" /></Icon>;
const changesIcon = <Icon><path d="M7 4h10M7 12h10M7 20h10" /><circle cx="4" cy="4" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="20" r="1" fill="currentColor" stroke="none" /></Icon>;

async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall back for local browsers that deny the async clipboard permission.
  }
  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  try { return document.execCommand("copy"); } finally { field.remove(); }
}

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
        ...graph.nodes.map((node) => ({ data: {
          id: node.id,
          label: node.title,
          kind: node.kind,
          trust: node.trust?.tier ?? "none",
          stale: node.trust?.stale ? "yes" : "no",
          lifecycle: node.trust?.status ?? "none",
        } })),
        ...graph.edges.map((edge) => ({ data: { id: edge.id, source: edge.source, target: edge.target, kind: edge.kind } })),
      ],
      style: [
        { selector: "node", style: { "background-color": "#fbfaf6", "border-color": "#7890a2", "border-width": 1.5, label: "data(label)", color: "#102a43", "font-family": "ui-monospace, 'SFMono-Regular', Consolas, monospace", "font-size": "10px", "font-weight": 600, "text-wrap": "wrap", "text-max-width": "116px", "text-valign": "bottom", "text-margin-y": 11, "text-background-color": "#f3f0e8", "text-background-opacity": 0.94, "text-background-padding": "4px", width: 24, height: 24 } },
        { selector: "node[kind = 'index']", style: { "background-color": "#102a43", "border-color": "#102a43", shape: "round-rectangle", width: 42, height: 42, color: "#102a43", "font-size": "11px", "text-max-width": "148px" } },
        { selector: "node[kind = 'concept']", style: { "background-color": "#84a9c5", "border-color": "#2f5d8c", shape: "diamond", width: 31, height: 31 } },
        { selector: "node[kind = 'source']", style: { "background-color": "#e2a665", "border-color": "#9a5b2c", shape: "round-rectangle", width: 32, height: 25 } },
        { selector: "node[kind = 'note']", style: { "background-color": "#fbfaf6", "border-color": "#6f8290", shape: "ellipse" } },
        { selector: "node[trust = 'machine-confirmed']", style: { "border-color": "#2f5d8c", "border-width": 2.5 } },
        { selector: "node[trust = 'human-reviewed']", style: { "border-color": "#2f756b", "border-width": 3 } },
        { selector: "node[lifecycle = 'deprecated']", style: { "border-color": "#9a5b2c", "border-style": "dashed", "border-width": 3 } },
        { selector: "node[stale = 'yes']", style: { "border-color": "#c4553d", "border-style": "dashed", "border-width": 3 } },
        { selector: "edge", style: { width: 1.1, "line-color": "#9aabb6", "target-arrow-color": "#7890a2", "target-arrow-shape": "triangle", "arrow-scale": 0.55, "curve-style": "bezier", opacity: 0.72 } },
        { selector: "edge.context", style: { width: 2.2, "line-color": "#c4553d", "target-arrow-color": "#c4553d", opacity: 0.98, "z-index": 20 } },
        { selector: "node.context", style: { "border-color": "#c4553d", "border-width": 2.5 } },
        { selector: ":selected", style: { "border-color": "#c4553d", "border-width": 3, "underlay-color": "#c4553d", "underlay-opacity": 0.12, "underlay-padding": 10 } },
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

function AppNavigation({ view, onView, drafts, changes, live }: { view: WorkbenchView; onView: (view: WorkbenchView) => void; drafts: number; changes: number; live: boolean }) {
  return <nav className="app-nav" aria-label="Workspace views">
    <button className={view === "map" ? "active" : ""} onClick={() => onView("map")} aria-current={view === "map" ? "page" : undefined}>
      {mapIcon}<span>Map</span>
    </button>
    <button className={view === "health" ? "active" : ""} onClick={() => onView("health")} aria-current={view === "health" ? "page" : undefined}>
      {healthIcon}<span>Health</span>
    </button>
    <button className={view === "drafts" ? "active" : ""} onClick={() => onView("drafts")} aria-current={view === "drafts" ? "page" : undefined}>
      {draftsIcon}<span>Drafts</span>{!live && <em className="local-badge">Local</em>}{drafts > 0 && <b className="nav-count draft" aria-label={`${drafts} intakes need attention`}>{drafts}</b>}
    </button>
    <button className={view === "changes" ? "active" : ""} onClick={() => onView("changes")} aria-current={view === "changes" ? "page" : undefined}>
      {changesIcon}<span>Changes</span>{!live && <em className="local-badge">Local</em>}{changes > 0 && <b className="nav-count" aria-label={`${changes} open proposals`}>{changes}</b>}
    </button>
  </nav>;
}

function Inspector({ graph, selected, onSelect }: { graph: WikiGraph; selected?: WikiNode; onSelect: (id: string) => void }) {
  const [contextCopied, setContextCopied] = useState(false);
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
  const contextCommand = selected ? `lwc context <vault> --focus ${shellQuote(selected.path)} --depth 1 --max-pages 8 --max-words 2000` : "";
  const knownMetadata = new Set(["type", "kind", "title", "description", "summary", "resource", "tags", "source", "sources", "usage_window", "generated", "verified", "status", "stale_after", "runtime", "parameters", "computation", "executor", "attester"]);
  const extensions = selected?.metadata ? Object.fromEntries(Object.entries(selected.metadata).filter(([key]) => !knownMetadata.has(key))) : {};
  useEffect(() => setContextCopied(false), [selected?.id]);

  return <aside className="inspector" aria-live="polite">
    <div className="panel-heading"><span>Page details</span>{selected && <span className={`kind-badge ${selected.kind}`}>{KIND_LABEL[selected.kind]}</span>}</div>
    {selected ? <>
      <div className="page-title"><span className={`page-mark ${selected.kind}`} /><h2>{selected.title}</h2></div>
      <p className="summary">{selected.summary || "This page does not have a summary yet."}</p>
      <dl className="metadata">
        <div><dt>Path</dt><dd>{selected.path}</dd></div>
        {selected.type && <div><dt>Type</dt><dd>{selected.type}</dd></div>}
        {selected.resource && <div><dt>Resource</dt><dd>{selected.resource}</dd></div>}
        <div><dt>Words</dt><dd>{selected.wordCount}</dd></div>
        <div><dt>Tags</dt><dd>{selected.tags.length ? selected.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>) : "—"}</dd></div>
      </dl>
      {Object.keys(extensions).length > 0 && <details className="metadata-extensions">
        <summary>Additional metadata <span>{Object.keys(extensions).length}</span></summary>
        <pre>{JSON.stringify(extensions, null, 2)}</pre>
      </details>}
      {selected.trust && <TrustInspector node={selected} />}
      <section className="context-handoff" aria-label="Agent context command">
        <div><span><p className="section-kicker">Agent handoff</p><h3>Bound the evidence</h3></span><button type="button" onClick={() => void copyText(contextCommand).then(setContextCopied)}>{contextCopied ? "Copied" : "Copy"}</button></div>
        <p>Export this page and its direct relationships with explicit page and word limits.</p>
        <code>{contextCommand}</code>
      </section>
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

function OkfFindings({ graph }: { graph: WikiGraph }) {
  if (!graph.okf?.issues.length) return null;
  const errors = graph.okf.issues.filter((issue) => issue.level === "error").length;
  const warnings = graph.okf.issues.length - errors;
  return <section className={`okf-findings${errors ? " has-errors" : ""}`} aria-label="OKF checker findings">
    <header><strong>OKF checker</strong><span>{errors} errors · {warnings} warnings</span></header>
    <ul>{graph.okf.issues.map((issue, index) => <li key={`${issue.path}-${issue.code}-${index}`}>
      <b className={issue.level}>{issue.level}</b><span>{issue.message}<small>{issue.path} · {issue.code}</small></span>
    </li>)}</ul>
  </section>;
}

const TRUST_LABEL = {
  "unverified": "Unverified",
  "machine-confirmed": "Machine confirmed",
  "human-reviewed": "Human reviewed",
} as const;

function readableDate(value?: string): string {
  if (!value) return "Not declared";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toISOString().slice(0, 10);
}

function TrustInspector({ node }: { node: WikiNode }) {
  const trust = node.trust!;
  const latestVerifier = latestVerification(trust.verified);
  const freshness = trust.stale
    ? `Stale since ${readableDate(trust.staleAfter)}`
    : trust.staleAfter ? `Fresh through ${readableDate(trust.staleAfter)}` : "No expiry declared";
  const sourceSummary = trust.sources.length
    ? trust.sources.slice(0, 2).map((source) => source.title ?? source.id ?? source.resource).join(" · ")
    : "No material source declared";

  return <section className={`trust-inspector tier-${trust.tier}${trust.stale ? " is-stale" : ""}`} aria-label="Knowledge trust signals">
    <header>
      <div><p className="section-kicker">OKF trust signals</p><h3>Evidence, not a score</h3></div>
      <span className="trust-tier"><i />{TRUST_LABEL[trust.tier]}</span>
    </header>
    <div className="trust-signal-grid">
      <article>
        <span>01 · Origin</span>
        <strong>{trust.generated?.by ?? "Not declared"}</strong>
        <small>{readableDate(trust.generated?.at)} · {trust.sources.length} source{trust.sources.length === 1 ? "" : "s"}</small>
      </article>
      <article>
        <span>02 · Review</span>
        <strong>{latestVerifier?.by ?? "No verifier"}</strong>
        <small>{latestVerifier ? readableDate(latestVerifier.at) : TRUST_LABEL[trust.tier]}</small>
      </article>
      <article className={trust.stale ? "attention" : ""}>
        <span>03 · Freshness</span>
        <strong>{freshness}</strong>
        <small>{trust.status} lifecycle</small>
      </article>
    </div>
    <div className="trust-source"><span>Material source</span><p>{sourceSummary}</p></div>
    {node.attestedComputation && <div className="attested-contract">
      <div><span>Attested computation</span><strong>{node.attestedComputation.runtime ?? "Runtime not declared"} · {node.attestedComputation.parameters.length} parameter{node.attestedComputation.parameters.length === 1 ? "" : "s"}</strong></div>
      <b>Contract only — not executed</b>
    </div>}
  </section>;
}

function MapView({ graph, selectedId, onSelect }: { graph: WikiGraph; selectedId?: string; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | NodeKind>("all");
  const visibleIds = useMemo(() => new Set(graph.nodes.filter((node) => {
    const text = `${node.title} ${node.path} ${node.type ?? ""} ${node.tags.join(" ")} ${node.summary} ${node.trust?.tier ?? ""} ${node.trust?.sources.map((source) => `${source.id ?? ""} ${source.title ?? ""} ${source.resource}`).join(" ") ?? ""}`.toLowerCase();
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
      <OkfFindings graph={graph} />
      <div className="canvas-frame">
        <div className="survey-coordinate coordinate-north" aria-hidden="true">N 00°</div>
        <div className="survey-coordinate coordinate-east" aria-hidden="true">E 90°</div>
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
  const allDiagnostics = [...graph.diagnostics, ...(graph.okf?.issues ?? [])];
  const errors = allDiagnostics.filter((item) => item.level === "error").length;
  const warnings = allDiagnostics.filter((item) => item.level === "warning").length;
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
        {allDiagnostics.length ? <ul className="diagnostic-list">{allDiagnostics.map((item, index) => <li key={`${item.path}-${item.code}-${index}`}>
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

const STATUS_LABEL: Record<ProposalStatus, string> = {
  proposed: "Needs review",
  reviewed: "Ready to apply",
  applied: "Applied",
  rejected: "Rejected",
};

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function proposalCommands(proposal: ProposalInboxItem): Array<{ label: string; command: string }> {
  if (proposal.status === "proposed") return [
    { label: "Review after checking every file", command: `lwc proposal review ${shellQuote(proposal.file)} --approve ${proposal.id} --reviewer "<name>"` },
    { label: "Or reject with a recorded reason", command: `lwc proposal reject ${shellQuote(proposal.file)} --confirm ${proposal.id} --reason "<reason>"` },
  ];
  if (proposal.status === "reviewed") return [
    { label: "Apply after rechecking the target state", command: `lwc proposal apply ${shellQuote(proposal.file)} "<vault>" --confirm ${proposal.id}` },
  ];
  return [];
}

function Lifecycle({ proposal }: { proposal: ProposalInboxItem }) {
  const applied = proposal.status === "applied";
  const reviewed = proposal.status === "reviewed" || applied;
  const rejected = proposal.status === "rejected";
  return <ol className={`lifecycle ${rejected ? "rejected" : ""}`} aria-label="Proposal lifecycle">
    <li className="complete"><i>✓</i><span><strong>Proposed</strong><small>{proposal.createdAt.slice(0, 10)}</small></span></li>
    {rejected ? <li className="current rejected"><i>×</i><span><strong>Rejected</strong><small>{proposal.rejection?.rejectedAt.slice(0, 10) ?? "Decision recorded"}</small></span></li> : <>
      <li className={reviewed ? "complete" : "current"}><i>{reviewed ? "✓" : "2"}</i><span><strong>Reviewed</strong><small>{proposal.review?.reviewedAt.slice(0, 10) ?? "Human decision required"}</small></span></li>
      <li className={applied ? "complete" : reviewed ? "current" : "pending"}><i>{applied ? "✓" : "3"}</i><span><strong>Applied</strong><small>{proposal.application?.appliedAt.slice(0, 10) ?? "Source files unchanged"}</small></span></li>
    </>}
  </ol>;
}

function TopologyPreview({ proposal }: { proposal: ProposalInboxItem }) {
  const { addedLinks, removedLinks, conflicts } = proposal.topology;
  const linkChanges = addedLinks.length + removedLinks.length;
  return <section className={`topology-preview ${conflicts.length ? "has-conflicts" : ""}`} data-testid="topology-preview">
    <div className="topology-heading">
      <div><p className="section-kicker">Relationship impact</p><h3>Change blueprint</h3></div>
      <div className="topology-totals" aria-label="Proposal impact totals">
        <span><b>{proposal.changes.length}</b> pages</span>
        <span><b>{linkChanges}</b> links</span>
        <span className={conflicts.length ? "danger" : "safe"}><b>{conflicts.length}</b> conflicts</span>
      </div>
    </div>
    {conflicts.length > 0 && <div className="conflict-banner" role="alert"><strong>Target state changed</strong><span>Review again before apply: {conflicts.join(", ")}</span></div>}
    <div className="topology-board">
      <div className="changed-pages">
        <span className="blueprint-label">Changed pages</span>
        {proposal.changes.map((change) => <div className={`page-chip ${change.targetState}`} key={change.path}>
          <i aria-hidden="true" />
          <span><strong>{change.path}</strong><small>{change.operation} · {change.targetState === "unchanged" ? "base verified" : change.targetState === "matches-proposal" ? "matches proposal" : "hash conflict"}</small></span>
        </div>)}
      </div>
      <div className="topology-links">
        <span className="blueprint-label">Relationship delta</span>
        {addedLinks.map((link) => <div className="topology-link added" key={`add-${link.source}-${link.kind}-${link.target}`}>
          <span className="link-sign">+</span><code>{link.source}</code><span className="link-arrow">→</span><strong>{link.target}</strong><small>{link.kind}</small>
        </div>)}
        {removedLinks.map((link) => <div className="topology-link removed" key={`remove-${link.source}-${link.kind}-${link.target}`}>
          <span className="link-sign">−</span><code>{link.source}</code><span className="link-arrow">→</span><strong>{link.target}</strong><small>{link.kind}</small>
        </div>)}
        {linkChanges === 0 && <div className="topology-stable"><span>＝</span><div><strong>No relationship changes</strong><small>The proposal changes content without changing links.</small></div></div>}
      </div>
    </div>
    <div className="topology-legend"><span><i className="amber" />Page changed</span><span><i className="green" />Link added</span><span><i className="red" />Link removed or conflicted</span></div>
  </section>;
}

function ProposalDossier({ proposal }: { proposal: ProposalInboxItem }) {
  const commands = proposalCommands(proposal);
  return <article className="proposal-dossier" data-testid="proposal-dossier">
    <header className="dossier-header">
      <div><p className="section-kicker">{proposal.id}</p><h2>{proposal.summary}</h2></div>
      <span className={`proposal-status ${proposal.status}`}>{STATUS_LABEL[proposal.status]}</span>
    </header>

    <Lifecycle proposal={proposal} />

    {proposal.intake && <section className="intake-provenance" aria-label="Source intake provenance">
      <div><p className="section-kicker">Source provenance</p><h3>{proposal.intake.sourceName}</h3></div>
      <dl><div><dt>Intake</dt><dd><code>{proposal.intake.id}</code></dd></div><div><dt>Source SHA-256</dt><dd><code>{proposal.intake.sourceHash}</code></dd></div><div><dt>Declared target</dt><dd><code>{proposal.intake.target}</code></dd></div>{proposal.intake.generator && <div><dt>Generator</dt><dd>{proposal.intake.generator}</dd></div>}</dl>
    </section>}

    <TopologyPreview proposal={proposal} />

    {(proposal.review || proposal.rejection || proposal.application) && <section className="decision-record">
      <h3>Decision record</h3>
      {proposal.review && <dl><div><dt>Reviewer</dt><dd>{proposal.review.reviewer}</dd></div><div><dt>Review note</dt><dd>{proposal.review.note || "—"}</dd></div><div><dt>Review SHA-256</dt><dd><code>{proposal.review.reviewHash}</code></dd></div></dl>}
      {proposal.rejection && <p><strong>Reason:</strong> {proposal.rejection.reason}</p>}
      {proposal.application && <p>Applied at <code>{proposal.application.appliedAt}</code>.</p>}
    </section>}

    <section className="file-review">
      <div className="review-heading"><div><p className="section-kicker">Exact file diff</p><h3>{proposal.changes.length} changed {proposal.changes.length === 1 ? "file" : "files"}</h3></div><span>Read-only evidence</span></div>
      {proposal.changes.map((change, index) => <details key={change.path} open={index === 0}>
        <summary><span className={`operation ${change.operation}`}>{change.operation}</span><strong>{change.path}</strong><small>{change.diff.filter((line) => line.kind === "add").length}+ · {change.diff.filter((line) => line.kind === "remove").length}−</small></summary>
        <div className={`hash-pair ${change.targetState === "conflict" ? "conflict" : ""}`}><div><span>Base SHA-256</span><code>{change.baseHash ?? "missing"}</code></div><div><span>Proposed SHA-256</span><code>{change.contentHash}</code></div>{change.targetState === "conflict" && <div><span>Current SHA-256</span><code>{change.currentHash ?? "missing"}</code></div>}</div>
        <pre className="diff-block" aria-label={`Diff for ${change.path}`}>{change.diff.map((line, lineIndex) => <span className={line.kind} key={`${line.kind}-${lineIndex}`}><b>{line.kind === "add" ? "+" : line.kind === "remove" ? "−" : " "}</b>{line.text || " "}</span>)}</pre>
      </details>)}
    </section>

    {commands.length > 0 && <section className="next-step">
      <div><p className="section-kicker">Safe next step</p><h3>The Workbench does not make this decision.</h3><p>Run a command in the Vault after reviewing the hashes and every changed line.</p></div>
      <div className="command-list">{commands.map((item) => <div key={item.label}><span>{item.label}</span><code>{item.command}</code></div>)}</div>
    </section>}
  </article>;
}

function ChangesView({ inbox, error, live }: { inbox?: ProposalInbox; error?: string; live: boolean }) {
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all");
  const [selectedId, setSelectedId] = useState<string>();
  const proposals = inbox?.proposals ?? [];
  const filtered = proposals.filter((proposal) => filter === "all" || (filter === "open" ? ["proposed", "reviewed"].includes(proposal.status) : ["applied", "rejected"].includes(proposal.status)));

  useEffect(() => {
    if (!filtered.some((proposal) => proposal.id === selectedId)) setSelectedId(filtered[0]?.id);
  }, [filter, inbox, selectedId]);
  const selected = proposals.find((proposal) => proposal.id === selectedId);

  if (!live) return <div className="changes-unavailable" data-testid="changes-view"><div className="empty-symbol">↗</div><p className="section-kicker">Local server required</p><h2>Open Changes with live Vault context.</h2><p>The static Viewer has no access to local proposal files. Start the loopback-only Workbench to inspect them.</p><code>lwc serve &lt;vault&gt;</code></div>;
  if (error) return <div className="changes-unavailable" data-testid="changes-view"><div className="empty-symbol issue">!</div><p className="section-kicker">Inbox unavailable</p><h2>Proposal files could not be read.</h2><p>{error}</p></div>;
  if (!inbox) return <div className="changes-unavailable" data-testid="changes-view"><div className="loading-mark" /><p className="section-kicker">Reading proposals</p><h2>Opening the review queue…</h2></div>;

  return <div className="changes-view" data-testid="changes-view">
    <aside className="inbox-panel">
      <header><div><p className="section-kicker">Agent changes</p><h2>Inbox</h2></div><strong>{proposals.length}</strong></header>
      <div className="inbox-filters" role="group" aria-label="Filter proposals">
        <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All</button>
        <button className={filter === "open" ? "active" : ""} onClick={() => setFilter("open")}>Open</button>
        <button className={filter === "closed" ? "active" : ""} onClick={() => setFilter("closed")}>Closed</button>
      </div>
      <div className="proposal-list">
        {filtered.map((proposal) => <button key={proposal.id} className={proposal.id === selectedId ? "active" : ""} onClick={() => setSelectedId(proposal.id)}>
          <span className={`proposal-status ${proposal.status}`}>{STATUS_LABEL[proposal.status]}</span>
          <strong>{proposal.summary}</strong>
          <small>{proposal.changes.length} {proposal.changes.length === 1 ? "file" : "files"} · {proposal.createdAt.slice(0, 10)}</small>
          <code>{proposal.id}</code>
        </button>)}
        {!filtered.length && <div className="inbox-empty"><strong>{proposals.length ? "No proposals in this state" : "No proposals yet"}</strong><p>{proposals.length ? "Choose another filter." : "Agent drafts remain outside the Vault until a proposal is created."}</p>{!proposals.length && <code>lwc proposal create &lt;vault&gt; --from &lt;draft&gt;</code>}</div>}
      </div>
      {inbox.issues.length > 0 && <section className="inbox-issues"><h3>Unreadable files <span>{inbox.issues.length}</span></h3>{inbox.issues.map((issue) => <div key={issue.file}><strong>{issue.file}</strong><small>{issue.message}</small></div>)}</section>}
    </aside>
    <div className="dossier-panel">{selected ? <ProposalDossier proposal={selected} /> : <div className="dossier-empty"><span>←</span><p>Select a proposal to inspect its exact evidence.</p></div>}</div>
  </div>;
}

const DRAFT_STATE_LABEL: Record<DraftInboxState, string> = {
  ready: "Ready to propose",
  "needs-draft": "Needs writing",
  blocked: "Blocked",
  proposed: "Proposal created",
};

const EVIDENCE_LABEL: Record<EvidenceState, string> = {
  verified: "Verified",
  changed: "Changed",
  missing: "Missing",
  unsafe: "Unsafe",
};

function DraftRelay({ draft }: { draft: DraftInboxItem }) {
  const sourceComplete = draft.source.state === "verified" && draft.source.snapshotState === "verified";
  const draftComplete = draft.draft.state === "edited" && draft.draft.scope === "declared-only";
  const proposalComplete = draft.proposal?.state === "verified";
  return <ol className="evidence-relay" aria-label="Source to proposal evidence chain">
    <li className={sourceComplete ? "complete" : "blocked"}><i>{sourceComplete ? "✓" : "!"}</i><span><b>01</b><strong>Source</strong><small>{sourceComplete ? "Original + snapshot verified" : "Evidence needs attention"}</small></span></li>
    <li className={draftComplete ? "complete current" : draft.state === "blocked" ? "blocked current" : "current"}><i>{draftComplete ? "✓" : draft.state === "blocked" ? "!" : "2"}</i><span><b>02</b><strong>Draft</strong><small>{draft.draft.state === "edited" ? draft.draft.scope === "declared-only" ? "Edited in isolated scope" : "Scope expanded" : draft.draft.state === "placeholder" ? "Placeholder awaits editing" : "Declared draft missing"}</small></span></li>
    <li className={proposalComplete ? "complete" : "pending"}><i>{proposalComplete ? "✓" : "3"}</i><span><b>03</b><strong>Proposal</strong><small>{proposalComplete ? "Provenance verified" : "Not in review queue"}</small></span></li>
  </ol>;
}

function EvidenceBadge({ state, label }: { state: EvidenceState; label: string }) {
  return <span className={`evidence-badge ${state}`}><i aria-hidden="true" />{label} {EVIDENCE_LABEL[state].toLowerCase()}</span>;
}

function DraftDossier({ draft }: { draft: DraftInboxItem }) {
  const nextCommand = `lwc intake propose '${draft.file.replaceAll("'", "'\\''")}' . --summary "Explain why this knowledge belongs in the Vault"`;
  return <article className="draft-dossier" data-testid="draft-dossier">
    <header className="dossier-header draft-header">
      <div><p className="section-kicker">Declared knowledge target</p><h2>{draft.draft.path}</h2><p>{draft.source.name} <span>→</span> {draft.target.operation === "create" ? "new page" : draft.target.operation === "update" ? "existing page" : "unsafe target"}</p></div>
      <span className={`draft-state ${draft.state}`}>{DRAFT_STATE_LABEL[draft.state]}</span>
    </header>

    <DraftRelay draft={draft} />

    {draft.blockers.length > 0 && <section className="draft-blockers" role="alert"><div><strong>Evidence gate closed</strong><span>{draft.blockers.length} {draft.blockers.length === 1 ? "issue" : "issues"}</span></div><ul>{draft.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></section>}

    <section className="evidence-ledger">
      <header><div><p className="section-kicker">Evidence ledger</p><h3>What the agent received and produced</h3></div><span>Read-only · local</span></header>
      <div className="ledger-grid">
        <dl>
          <div><dt>Original source</dt><dd><code>{draft.source.path}</code><EvidenceBadge state={draft.source.state} label="Original" /></dd></div>
          <div><dt>Captured copy</dt><dd><code>{draft.source.snapshot}</code><EvidenceBadge state={draft.source.snapshotState} label="Snapshot" /></dd></div>
          <div><dt>Source SHA-256</dt><dd><code>{draft.source.sha256}</code></dd></div>
        </dl>
        <dl>
          <div><dt>Generator</dt><dd>{draft.generator ?? "Not recorded"}</dd></div>
          <div><dt>Created</dt><dd><code>{draft.createdAt}</code></dd></div>
          <div><dt>Draft scope</dt><dd><span className={`scope-state ${draft.draft.scope}`}>{draft.draft.scope === "declared-only" ? "One declared target" : "Expanded beyond target"}</span></dd></div>
        </dl>
      </div>
    </section>

    <section className="evidence-compare">
      <article><header><span>Source snapshot</span><EvidenceBadge state={draft.source.snapshotState} label="Copy" /></header><pre>{draft.source.snapshotContent ?? "Source snapshot is unavailable."}</pre><footer><code>{draft.source.sha256}</code></footer></article>
      <article className="generated"><header><span>Isolated draft</span><span className={`draft-edit-state ${draft.draft.state}`}>{draft.draft.state}</span></header><pre>{draft.draft.content ?? "Declared draft is unavailable."}</pre><footer><code>{draft.draft.currentHash ?? "no draft hash"}</code></footer></article>
    </section>

    <section className={`draft-next-step ${draft.state}`}>
      <div><p className="section-kicker">Safe next step</p><h3>{draft.state === "ready" ? "Promote the draft into the review queue." : draft.state === "needs-draft" ? "Write inside the isolated draft first." : draft.state === "proposed" ? "Continue in Changes." : "Repair the evidence before proposing."}</h3><p>{draft.state === "ready" ? "This creates a hash-bound Proposal; it does not edit the formal Vault." : draft.state === "needs-draft" ? `Edit ${draft.draft.path}; the live inbox will re-check it.` : draft.state === "proposed" ? `Linked proposal ${draft.proposal?.id ?? "is unavailable"}. Review remains a separate human decision.` : "Blocked intakes cannot safely enter review."}</p></div>
      {draft.state === "ready" && <code>{nextCommand}</code>}
      {draft.state === "needs-draft" && <code>{draft.file.replace(/intake\.json$/, draft.draft.path)}</code>}
      {draft.state === "proposed" && draft.proposal && <code>{draft.proposal.file}</code>}
    </section>
  </article>;
}

function DraftsView({ inbox, error, live }: { inbox?: DraftInbox; error?: string; live: boolean }) {
  const [filter, setFilter] = useState<"all" | "actionable" | "proposed">("all");
  const [selectedId, setSelectedId] = useState<string>();
  const drafts = inbox?.drafts ?? [];
  const filtered = drafts.filter((draft) => filter === "all" || (filter === "actionable" ? draft.state !== "proposed" : draft.state === "proposed"));

  useEffect(() => {
    if (!filtered.some((draft) => draft.id === selectedId)) setSelectedId(filtered[0]?.id);
  }, [filter, inbox, selectedId]);
  const selected = drafts.find((draft) => draft.id === selectedId);

  if (!live) return <div className="changes-unavailable" data-testid="drafts-view"><div className="empty-symbol violet">↗</div><p className="section-kicker">Local server required</p><h2>Open Drafts with live source evidence.</h2><p>The generated Viewer does not read local intake files. Start the loopback-only Workbench to inspect isolated drafts.</p><code>lwc serve &lt;vault&gt;</code></div>;
  if (error) return <div className="changes-unavailable" data-testid="drafts-view"><div className="empty-symbol issue">!</div><p className="section-kicker">Draft inbox unavailable</p><h2>Intake evidence could not be read.</h2><p>{error}</p></div>;
  if (!inbox) return <div className="changes-unavailable" data-testid="drafts-view"><div className="loading-mark violet" /><p className="section-kicker">Reading source intake</p><h2>Verifying the evidence chain…</h2></div>;

  return <div className="drafts-view" data-testid="drafts-view">
    <aside className="inbox-panel draft-inbox">
      <header><div><p className="section-kicker">Source intake</p><h2>Drafts</h2></div><strong>{drafts.length}</strong></header>
      <div className="inbox-filters" role="group" aria-label="Filter drafts">
        <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All</button>
        <button className={filter === "actionable" ? "active" : ""} onClick={() => setFilter("actionable")}>Active</button>
        <button className={filter === "proposed" ? "active" : ""} onClick={() => setFilter("proposed")}>Proposed</button>
      </div>
      <div className="proposal-list draft-list">
        {filtered.map((draft) => <button key={draft.id} className={draft.id === selectedId ? "active" : ""} onClick={() => setSelectedId(draft.id)}>
          <span className={`draft-state ${draft.state}`}>{DRAFT_STATE_LABEL[draft.state]}</span>
          <strong>{draft.draft.path}</strong>
          <small>{draft.source.name} · {draft.generator ?? "unknown generator"}</small>
          <code>{draft.id}</code>
        </button>)}
        {!filtered.length && <div className="inbox-empty"><strong>{drafts.length ? "No intakes in this state" : "No source intakes yet"}</strong><p>{drafts.length ? "Choose another filter." : "Capture a source into an isolated, hash-bound draft workspace."}</p>{!drafts.length && <code>lwc intake create &lt;source&gt; &lt;vault&gt; --target &lt;page.md&gt;</code>}</div>}
      </div>
      {inbox.issues.length > 0 && <section className="inbox-issues"><h3>Unreadable intakes <span>{inbox.issues.length}</span></h3>{inbox.issues.map((issue) => <div key={issue.file}><strong>{issue.file}</strong><small>{issue.message}</small></div>)}</section>}
    </aside>
    <div className="dossier-panel">{selected ? <DraftDossier draft={selected} /> : <div className="dossier-empty"><span className="violet-arrow">←</span><p>Select an intake to inspect its source-to-proposal evidence.</p></div>}</div>
  </div>;
}

export function App() {
  const [graph, setGraph] = useState<WikiGraph>();
  const [error, setError] = useState<string>();
  const [inbox, setInbox] = useState<ProposalInbox>();
  const [inboxError, setInboxError] = useState<string>();
  const [drafts, setDrafts] = useState<DraftInbox>();
  const [draftsError, setDraftsError] = useState<string>();
  const [view, setView] = useState<WorkbenchView>("map");
  const [selectedId, setSelectedId] = useState<string>();
  const live = new URLSearchParams(location.search).get("live") === "1";

  useEffect(() => {
    const source = new URLSearchParams(location.search).get("graph") ?? new URL("./graph.json", document.baseURI).toString();
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
          : value.nodes.find((node) => node.path === "index.md")?.id
            ?? value.nodes.find((node) => node.kind === "index")?.id
            ?? value.nodes[0]?.id);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      }
    };
    const loadInbox = async () => {
      if (!live) return;
      try {
        const response = await fetch("/__lwc/proposals", { cache: "no-store" });
        if (!response.ok) throw new Error(`Unable to read proposals: HTTP ${response.status}`);
        const value = await response.json() as ProposalInbox;
        if (!active) return;
        setInbox(value);
        setInboxError(undefined);
      } catch (reason) {
        if (active) setInboxError(reason instanceof Error ? reason.message : String(reason));
      }
    };
    const loadDrafts = async () => {
      if (!live) return;
      try {
        const response = await fetch("/__lwc/drafts", { cache: "no-store" });
        if (!response.ok) throw new Error(`Unable to read drafts: HTTP ${response.status}`);
        const value = await response.json() as DraftInbox;
        if (!active) return;
        setDrafts(value);
        setDraftsError(undefined);
      } catch (reason) {
        if (active) setDraftsError(reason instanceof Error ? reason.message : String(reason));
      }
    };
    void load();
    void loadInbox();
    void loadDrafts();
    const events = live ? new EventSource("/__lwc/events") : undefined;
    events?.addEventListener("graph", () => { void load(); });
    events?.addEventListener("proposals", () => { void loadInbox(); });
    events?.addEventListener("drafts", () => { void loadDrafts(); });
    return () => { active = false; events?.close(); };
  }, [live]);

  if (error) return <main className="status-screen"><div className="status-mark">!</div><p className="section-kicker">Graph unavailable</p><h1>The knowledge map could not open.</h1><p>{error}</p><code>pnpm demo:build</code></main>;
  if (!graph) return <main className="status-screen"><div className="loading-mark" /><p className="section-kicker">Reading local knowledge</p><h1>Opening workspace…</h1></main>;

  const switchToPage = (id: string) => { setSelectedId(id); setView("map"); };
  const openChanges = inbox?.proposals.filter((proposal) => proposal.status === "proposed" || proposal.status === "reviewed").length ?? 0;
  const activeDrafts = drafts?.drafts.filter((draft) => draft.state !== "proposed").length ?? 0;
  const viewTitle = view === "map" ? "Knowledge map" : view === "health" ? "Vault health" : view === "drafts" ? "Draft intake" : "Changes inbox";

  return <main className="workbench-shell">
    <a className="skip-link" href="#workspace-content">Skip to workspace</a>
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark" aria-hidden="true"><i /><i /></span><div><strong>LLM Wiki Canvas</strong><small>Evidence cartography</small></div></div>
      <div className="vault-label"><span>Local survey / vault</span><strong>{graph.rootName}</strong></div>
      <AppNavigation view={view} onView={setView} drafts={activeDrafts} changes={openChanges} live={live} />
      <div className="sidebar-note"><span className="status-dot" /><div><strong>{live ? "Watching source" : "Local evidence"}</strong><small>{live ? "Markdown refreshes this projection" : "Markdown remains the source of truth"}</small></div></div>
    </aside>

    <section className={`workbench ${live ? "is-live" : "is-demo"}`} id="workspace-content">
      <header className="topbar">
        <div className="mobile-brand"><span className="brand-mark" aria-hidden="true"><i /><i /></span><strong>{graph.rootName}</strong></div>
        <div className="breadcrumb"><span>{graph.rootName}</span><b>/</b><strong>{viewTitle}</strong></div>
        <div className="evidence-route" aria-label="Evidence workflow"><span>Source</span><i>→</i><span>Projection</span><i>→</i><strong>Human gate</strong></div>
        <div className="topbar-meta">{graph.okf && <span className="okf-version">OKF {graph.okf.version}</span>}<span className="status-dot" />{live ? "Live" : "Generated"} {graph.generatedAt.slice(0, 10)}</div>
      </header>
      {!live && <section className="demo-disclosure" aria-label="Static demo notice"><div><strong>Sample Atlas · static demo</strong><span>8 synthetic pages. Your local files are not being read or uploaded.</span></div><code>pnpm lwc serve /path/to/vault</code><a href="https://github.com/chicogong/llm-wiki-canvas#readme">Run from source ↗</a></section>}
      <h1 className="sr-only">{viewTitle}</h1>
      <div className="mobile-nav"><AppNavigation view={view} onView={setView} drafts={activeDrafts} changes={openChanges} live={live} /></div>
      {view === "map" && <MapView graph={graph} selectedId={selectedId} onSelect={setSelectedId} />}
      {view === "health" && <HealthView graph={graph} onOpenPage={switchToPage} />}
      {view === "drafts" && <DraftsView inbox={drafts} error={draftsError} live={live} />}
      {view === "changes" && <ChangesView inbox={inbox} error={inboxError} live={live} />}
    </section>
  </main>;
}
