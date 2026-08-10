import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import cytoscape, { type Core } from "cytoscape";
import type { ProposalInbox, ProposalInboxItem, ProposalStatus } from "../core/index.js";
import type { NodeKind, WikiGraph, WikiNode } from "../core/types";

type WorkbenchView = "map" | "health" | "changes";

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
const changesIcon = <Icon><path d="M7 4h10M7 12h10M7 20h10" /><circle cx="4" cy="4" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="20" r="1" fill="currentColor" stroke="none" /></Icon>;

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

function AppNavigation({ view, onView, changes }: { view: WorkbenchView; onView: (view: WorkbenchView) => void; changes: number }) {
  return <nav className="app-nav" aria-label="Workspace views">
    <button className={view === "map" ? "active" : ""} onClick={() => onView("map")} aria-current={view === "map" ? "page" : undefined}>
      {mapIcon}<span>Map</span>
    </button>
    <button className={view === "health" ? "active" : ""} onClick={() => onView("health")} aria-current={view === "health" ? "page" : undefined}>
      {healthIcon}<span>Health</span>
    </button>
    <button className={view === "changes" ? "active" : ""} onClick={() => onView("changes")} aria-current={view === "changes" ? "page" : undefined}>
      {changesIcon}<span>Changes</span>{changes > 0 && <b className="nav-count" aria-label={`${changes} open proposals`}>{changes}</b>}
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

export function App() {
  const [graph, setGraph] = useState<WikiGraph>();
  const [error, setError] = useState<string>();
  const [inbox, setInbox] = useState<ProposalInbox>();
  const [inboxError, setInboxError] = useState<string>();
  const [view, setView] = useState<WorkbenchView>("map");
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
    void load();
    void loadInbox();
    const events = live ? new EventSource("/__lwc/events") : undefined;
    events?.addEventListener("graph", () => { void load(); });
    events?.addEventListener("proposals", () => { void loadInbox(); });
    return () => { active = false; events?.close(); };
  }, [live]);

  if (error) return <main className="status-screen"><div className="status-mark">!</div><p className="section-kicker">Graph unavailable</p><h1>The knowledge map could not open.</h1><p>{error}</p><code>pnpm demo:build</code></main>;
  if (!graph) return <main className="status-screen"><div className="loading-mark" /><p className="section-kicker">Reading local knowledge</p><h1>Opening workspace…</h1></main>;

  const switchToPage = (id: string) => { setSelectedId(id); setView("map"); };
  const openChanges = inbox?.proposals.filter((proposal) => proposal.status === "proposed" || proposal.status === "reviewed").length ?? 0;
  const viewTitle = view === "map" ? "Knowledge map" : view === "health" ? "Vault health" : "Changes inbox";

  return <main className="workbench-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">L</span><div><strong>LLM Wiki Canvas</strong><small>Local knowledge workbench</small></div></div>
      <div className="vault-label"><span>Workspace</span><strong>{graph.rootName}</strong></div>
      <AppNavigation view={view} onView={setView} changes={openChanges} />
      <div className="sidebar-note"><span className="status-dot" /><div><strong>{live ? "Watching locally" : "Local only"}</strong><small>{live ? "Refreshes when Markdown changes" : "Markdown stays on this machine"}</small></div></div>
    </aside>

    <section className="workbench">
      <header className="topbar">
        <div className="mobile-brand"><span className="brand-mark">L</span><strong>{graph.rootName}</strong></div>
        <div className="breadcrumb"><span>{graph.rootName}</span><b>/</b><strong>{viewTitle}</strong></div>
        <div className="topbar-meta"><span className="status-dot" />{live ? "Live" : "Generated"} {graph.generatedAt.slice(0, 10)}</div>
      </header>
      <div className="mobile-nav"><AppNavigation view={view} onView={setView} changes={openChanges} /></div>
      {view === "map" && <MapView graph={graph} selectedId={selectedId} onSelect={setSelectedId} />}
      {view === "health" && <HealthView graph={graph} onOpenPage={switchToPage} />}
      {view === "changes" && <ChangesView inbox={inbox} error={inboxError} live={live} />}
    </section>
  </main>;
}
