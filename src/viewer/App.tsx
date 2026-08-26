import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import cytoscape, { type Core } from "cytoscape";
import type { DraftInbox, DraftInboxItem, EvidenceState, ProposalInbox, ProposalInboxItem } from "../core/index.js";
import { latestVerification } from "../core/trust.js";
import type { NodeKind, WikiGraph, WikiNode } from "../core/types";
import { detectViewerLocale, localeHref, REVIEW_COPY, UI_COPY, type ReviewCopy, type ViewerCopy } from "./i18n";

type WorkbenchView = "map" | "health" | "drafts" | "changes";

function workbenchViewFromSearch(search: string): WorkbenchView {
  const view = new URLSearchParams(search).get("view");
  return view === "health" || view === "drafts" || view === "changes" ? view : "map";
}

const KINDS: Array<"all" | NodeKind> = ["all", "index", "concept", "source", "note"];

function kindLabel(copy: ViewerCopy, kind: "all" | NodeKind): string {
  return copy.kinds[kind];
}

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

function graphFitPadding(width: number): number {
  return width < 600 ? 28 : 72;
}

function GraphStage({ graph, visibleIds, selectedId, onSelect, copy }: {
  graph: WikiGraph;
  visibleIds: Set<string>;
  selectedId?: string;
  onSelect: (id: string) => void;
  copy: ViewerCopy;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const css = getComputedStyle(document.documentElement);
    const token = (name: string) => css.getPropertyValue(name).trim();
    const theme = {
      ink: token("--ink"),
      paper: token("--surface"),
      line: token("--line-strong"),
      relation: token("--relation"),
      index: token("--kind-index"),
      concept: token("--kind-concept"),
      source: token("--kind-source"),
      note: token("--kind-note"),
      selected: token("--focus"),
      verified: token("--verified"),
      warning: token("--warning"),
      danger: token("--danger"),
    };
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
        { selector: "node", style: { "background-color": theme.note, "border-color": theme.line, "border-width": 1.5, label: "data(label)", color: theme.ink, "font-family": "system-ui", "font-size": "11px", "font-weight": 600, "text-wrap": "wrap", "text-max-width": "126px", "text-valign": "bottom", "text-margin-y": 11, "text-background-color": theme.paper, "text-background-opacity": 0.96, "text-background-padding": "4px", width: 27, height: 27 } },
        { selector: "node[kind = 'index']", style: { "background-color": theme.index, "border-color": theme.index, shape: "ellipse", width: 44, height: 44, "font-size": "12px", "text-max-width": "154px" } },
        { selector: "node[kind = 'concept']", style: { "background-color": theme.concept, "border-color": theme.concept, shape: "ellipse", width: 34, height: 34 } },
        { selector: "node[kind = 'source']", style: { "background-color": theme.source, "border-color": theme.source, shape: "ellipse", width: 32, height: 32 } },
        { selector: "node[kind = 'note']", style: { "background-color": theme.note, "border-color": theme.line, shape: "ellipse" } },
        { selector: "node[trust = 'machine-confirmed']", style: { "border-color": theme.selected, "border-width": 2.5 } },
        { selector: "node[trust = 'human-reviewed']", style: { "border-color": theme.verified, "border-width": 3 } },
        { selector: "node[lifecycle = 'deprecated']", style: { "border-color": theme.warning, "border-style": "dashed", "border-width": 3 } },
        { selector: "node[stale = 'yes']", style: { "border-color": theme.danger, "border-style": "dashed", "border-width": 3 } },
        { selector: "edge", style: { width: 1, "line-color": theme.relation, "target-arrow-color": theme.line, "target-arrow-shape": "triangle", "arrow-scale": 0.55, "curve-style": "bezier", opacity: 0.82 } },
        { selector: "edge.context", style: { width: 2.2, "line-color": theme.selected, "target-arrow-color": theme.selected, opacity: 0.95, "z-index": 20 } },
        { selector: "node.context", style: { "border-color": theme.selected, "border-width": 2.5 } },
        { selector: ":selected", style: { "border-color": theme.selected, "border-width": 3, "underlay-color": theme.selected, "underlay-opacity": 0.1, "underlay-padding": 10 } },
        { selector: ".muted", style: { opacity: 0.08 } },
      ],
      layout: {
        name: "concentric",
        animate: false,
        fit: true,
        padding: graphFitPadding(ref.current.clientWidth),
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
    cy.nodes().forEach((node) => { node.style("display", visibleIds.has(node.id()) ? "element" : "none"); });
    cy.edges().forEach((edge) => { edge.style("display", visibleIds.has(edge.source().id()) && visibleIds.has(edge.target().id()) ? "element" : "none"); });
    cy.fit(cy.elements(":visible"), graphFitPadding(ref.current?.clientWidth ?? 1000));
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

  const fit = () => cyRef.current?.fit(cyRef.current.elements(":visible"), graphFitPadding(ref.current?.clientWidth ?? 1000));
  const zoom = (factor: number) => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.zoom({ level: Math.max(cy.minZoom(), Math.min(cy.maxZoom(), cy.zoom() * factor)), renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  };

  return <div className="graph-stage">
    <div ref={ref} className="graph-canvas" data-testid="graph-canvas" aria-label={copy.mapTitle} role="img" />
    <div className="graph-controls" aria-label={copy.mapControls}>
      <button type="button" onClick={() => zoom(1.2)} aria-label={copy.zoomIn}>+</button>
      <button type="button" onClick={() => zoom(0.84)} aria-label={copy.zoomOut}>−</button>
      <button type="button" onClick={fit} aria-label={copy.fitMap}>{copy.fit}</button>
    </div>
  </div>;
}

function AppNavigation({ view, onView, drafts, changes, live, copy }: { view: WorkbenchView; onView: (view: WorkbenchView) => void; drafts: number; changes: number; live: boolean; copy: ViewerCopy }) {
  return <nav className="app-nav" aria-label="Workspace views">
    <button className={view === "map" ? "active" : ""} onClick={() => onView("map")} aria-current={view === "map" ? "page" : undefined}>
      {mapIcon}<span>{copy.map}</span>
    </button>
    <button className={view === "health" ? "active" : ""} onClick={() => onView("health")} aria-current={view === "health" ? "page" : undefined}>
      {healthIcon}<span>{copy.health}</span>
    </button>
    <button className={view === "drafts" ? "active" : ""} onClick={() => onView("drafts")} aria-current={view === "drafts" ? "page" : undefined}>
      {draftsIcon}<span>{copy.drafts}</span>{!live && <em className="local-badge">{copy.demoBadge}</em>}{drafts > 0 && <b className="nav-count draft" aria-label={`${drafts} ${copy.draftCountLabel}`}>{drafts}</b>}
    </button>
    <button className={view === "changes" ? "active" : ""} onClick={() => onView("changes")} aria-current={view === "changes" ? "page" : undefined}>
      {changesIcon}<span>{copy.changes}</span>{!live && <em className="local-badge">{copy.demoBadge}</em>}{changes > 0 && <b className="nav-count" aria-label={`${changes} ${copy.proposalCountLabel}`}>{changes}</b>}
    </button>
  </nav>;
}

function ProductThesis({ copy, locale }: { copy: ViewerCopy; locale: "en" | "zh-CN" }) {
  const steps = [
    { label: copy.flowSource, meta: copy.flowSourceMeta, code: "source.md" },
    { label: copy.flowDraft, meta: copy.flowDraftMeta, code: ".lwc/drafts/" },
    { label: copy.flowProposal, meta: copy.flowProposalMeta, code: "proposal.json" },
    { label: copy.flowDecision, meta: copy.flowDecisionMeta, code: "review → apply" },
  ];
  return <section className="product-thesis" aria-labelledby="product-thesis-title" data-testid="product-thesis">
    <div className="thesis-copy">
      <p className="section-kicker">{copy.heroEyebrow}</p>
      <h1 id="product-thesis-title" aria-label={copy.heroTitle}>{locale === "zh-CN" ? <><span>Agent 可以写，</span><span>知识不能悄悄失控。</span></> : copy.heroTitle}</h1>
      <p className="thesis-description">{copy.heroDescription}</p>
      <div className="thesis-actions">
        <a className="primary" href={locale === "zh-CN" ? "https://github.com/chicogong/llm-wiki-canvas/blob/main/README.zh-CN.md#快速开始" : "https://github.com/chicogong/llm-wiki-canvas#quick-start"}>{copy.heroInstall}</a>
        <a href="https://github.com/chicogong/llm-wiki-canvas">{copy.heroSource} <span aria-hidden="true">↗</span></a>
      </div>
      <ul className="thesis-boundaries">
        <li>{copy.heroBoundaryLocal}</li>
        <li>{copy.heroBoundaryModel}</li>
        <li>{copy.heroBoundaryDecision}</li>
      </ul>
    </div>
    <ol className="review-spine" aria-label={copy.evidenceWorkflow}>
      {steps.map((step, index) => <li key={step.label}>
        <span className="spine-index">{String(index + 1).padStart(2, "0")}</span>
        <span className="spine-node" aria-hidden="true" />
        <div><strong>{step.label}</strong><small>{step.meta}</small></div>
        <code>{step.code}</code>
      </li>)}
    </ol>
  </section>;
}

function Inspector({ graph, selected, onSelect, copy }: { graph: WikiGraph; selected?: WikiNode; onSelect: (id: string) => void; copy: ViewerCopy }) {
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
    <ol className="evidence-spine" aria-label={copy.evidenceRoute}>
      <li className={selected ? "complete" : "current"}><span>{copy.source}</span><small>{selected ? selected.path : copy.selectPage}</small></li>
      <li className={selected ? "current" : "pending"}><span>{copy.structure}</span><small>{selected ? copy.directRelations(relations.length) : copy.waitingSelection}</small></li>
      <li className="pending"><span>{copy.decision}</span><small>{copy.humanControlled}</small></li>
    </ol>
    <div className="panel-heading"><span>{copy.evidenceSheet}</span>{selected && <span className={`kind-badge ${selected.kind}`}>{kindLabel(copy, selected.kind)}</span>}</div>
    {selected ? <>
      <div className="page-title"><span className={`page-mark ${selected.kind}`} /><h2>{selected.title}</h2></div>
      <p className="summary">{selected.summary || copy.noSummary}</p>
      <dl className="metadata">
        <div><dt>{copy.path}</dt><dd>{selected.path}</dd></div>
        {selected.type && <div><dt>{copy.type}</dt><dd>{selected.type}</dd></div>}
        {selected.resource && <div><dt>{copy.resource}</dt><dd>{selected.resource}</dd></div>}
        <div><dt>{copy.words}</dt><dd>{selected.wordCount}</dd></div>
        <div><dt>{copy.tags}</dt><dd>{selected.tags.length ? selected.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>) : "—"}</dd></div>
      </dl>
      {Object.keys(extensions).length > 0 && <details className="metadata-extensions">
        <summary>{copy.additionalMetadata} <span>{Object.keys(extensions).length}</span></summary>
        <pre>{JSON.stringify(extensions, null, 2)}</pre>
      </details>}
      {selected.trust && <TrustInspector node={selected} />}
      <section className="relations">
        <h3>{copy.connections} <span>{relations.length}</span></h3>
        {relations.length ? relations.map(({ node, direction, kind }, index) => <button key={`${node.id}-${index}`} onClick={() => onSelect(node.id)}>
          <span className={`relation-mark ${node.kind}`} />
          <span><strong>{node.title}</strong><small>{direction === "out" ? copy.linksTo : copy.linkedFrom} · {kind}</small></span>
          <span className="relation-arrow">→</span>
        </button>) : <p className="empty-copy">{copy.noConnections}</p>}
      </section>
      <section className="context-handoff" aria-label="Agent context command">
        <div><div><p className="section-kicker">{copy.boundedExport}</p><h3>{copy.handToAgent}</h3></div><button type="button" onClick={() => void copyText(contextCommand).then(setContextCopied)}>{contextCopied ? copy.copied : copy.copyCommand}</button></div>
        <p>{copy.exportDescription}</p>
        <code>{contextCommand}</code>
      </section>
    </> : <p className="empty-copy">{copy.selectNode}</p>}
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
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" }).format(date);
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
      <span className="trust-tier"><i aria-hidden="true" />{TRUST_LABEL[trust.tier]}</span>
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

function MapView({ graph, selectedId, onSelect, copy }: { graph: WikiGraph; selectedId?: string; onSelect: (id: string) => void; copy: ViewerCopy }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | NodeKind>("all");
  const visibleIds = useMemo(() => new Set(graph.nodes.filter((node) => {
    const text = `${node.title} ${node.path} ${node.type ?? ""} ${node.tags.join(" ")} ${node.summary} ${node.trust?.tier ?? ""} ${node.trust?.sources.map((source) => `${source.id ?? ""} ${source.title ?? ""} ${source.resource}`).join(" ") ?? ""}`.toLowerCase();
    return (kind === "all" || node.kind === kind) && text.includes(query.trim().toLowerCase());
  }).map((node) => node.id)), [graph, kind, query]);
  const selected = graph.nodes.find((node) => node.id === selectedId);
  const visibleNodes = graph.nodes.filter((node) => visibleIds.has(node.id));
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  return <div className="map-view" data-testid="map-view">
    <section className="map-panel">
      <div className="map-toolbar">
        <label className="search-field">
          <Icon><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></Icon>
          <span className="sr-only">{copy.searchLabel}</span>
          <input ref={searchRef} name="wiki-search" autoComplete="off" spellCheck={false} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.searchPlaceholder} />
          <kbd>⌘ K</kbd>
        </label>
        <div className="kind-tabs" role="group" aria-label={copy.filterLabel}>
          {KINDS.map((item) => <button key={item} className={kind === item ? "active" : ""} onClick={() => setKind(item)}>{kindLabel(copy, item)}</button>)}
        </div>
        <span className="visible-count" aria-live="polite"><b>{visibleIds.size}</b> {copy.countConnector} {graph.nodes.length}</span>
        <label className="page-jump"><span className="sr-only">{copy.openPage}</span><select value={selectedId ?? ""} onChange={(event) => onSelect(event.target.value)}><option value="" disabled>{copy.browsePages}</option>{visibleNodes.map((node) => <option value={node.id} key={node.id}>{node.title}</option>)}</select></label>
      </div>
      <OkfFindings graph={graph} />
      <div className="canvas-frame">
        <GraphStage graph={graph} visibleIds={visibleIds} selectedId={selectedId} onSelect={onSelect} copy={copy} />
        <div className="legend" aria-label={copy.mapLegend}>
          {KINDS.slice(1).map((item) => <span key={item}><i className={`dot ${item}`} aria-hidden="true" />{kindLabel(copy, item)}</span>)}
        </div>
        <div className="canvas-help">{copy.canvasHelp}</div>
      </div>
    </section>
    <Inspector graph={graph} selected={selected} onSelect={onSelect} copy={copy} />
  </div>;
}

function HealthView({ graph, onOpenPage, copy }: { graph: WikiGraph; onOpenPage: (id: string) => void; copy: ViewerCopy }) {
  const allDiagnostics = [...graph.diagnostics, ...(graph.okf?.issues ?? [])];
  const errors = allDiagnostics.filter((item) => item.level === "error").length;
  const warnings = allDiagnostics.filter((item) => item.level === "warning").length;
  const healthyPages = Math.max(0, graph.stats.files - graph.stats.orphanNodes);
  const kindCounts = KINDS.slice(1).map((item) => ({ value: item as NodeKind, label: kindLabel(copy, item), count: graph.nodes.filter((node) => node.kind === item).length }));
  const hubs = graph.nodes.map((node) => ({ node, connections: graph.edges.filter((edge) => edge.source === node.id || edge.target === node.id).length }))
    .sort((a, b) => b.connections - a.connections || a.node.title.localeCompare(b.node.title)).slice(0, 5);

  return <div className="health-view" data-testid="health-view">
    <section className="health-intro">
      <div><p className="section-kicker">{copy.vaultHealth}</p><h2>{errors === 0 ? copy.healthyTitle : copy.attentionTitle}</h2></div>
      <p>{copy.healthDescription}</p>
    </section>
    <section className="metric-grid" aria-label={copy.healthMetrics}>
      <article><span>{copy.pages}</span><strong>{graph.stats.files}</strong><small>{healthyPages} {copy.connected}</small></article>
      <article><span>{copy.relationships}</span><strong>{graph.stats.links}</strong><small>{copy.resolvedLinks}</small></article>
      <article className={graph.stats.brokenLinks ? "attention" : "verified"}><span>{copy.brokenLinks}</span><strong>{graph.stats.brokenLinks}</strong><small>{graph.stats.brokenLinks ? copy.needsReview : copy.allResolve}</small></article>
      <article className={graph.stats.orphanNodes ? "attention" : "verified"}><span>{copy.orphanPages}</span><strong>{graph.stats.orphanNodes}</strong><small>{graph.stats.orphanNodes ? copy.notConnected : copy.everyConnected}</small></article>
    </section>
    <div className="health-columns">
      <section className="health-card diagnostics-card">
        <div className="card-title"><div><p className="section-kicker">{copy.diagnostics}</p><h3>{copy.scanResults}</h3></div><span>{errors} {copy.errors} · {warnings} {copy.warnings}</span></div>
        {allDiagnostics.length ? <ul className="diagnostic-list">{allDiagnostics.map((item, index) => <li key={`${item.path}-${item.code}-${index}`}>
          <span className={`diagnostic-level ${item.level}`} />
          <div><strong>{item.message}</strong><small>{item.path} · {item.code}</small></div>
        </li>)}</ul> : <div className="healthy-state"><span>✓</span><div><strong>{copy.noIssues}</strong><p>{copy.allParticipate}</p></div></div>}
      </section>
      <section className="health-card">
        <div className="card-title"><div><p className="section-kicker">{copy.structure}</p><h3>{copy.pageTypes}</h3></div><span>{graph.nodes.length} {copy.total}</span></div>
        <div className="kind-breakdown">{kindCounts.map((item) => <div key={item.value}><span><i className={`dot ${item.value}`} aria-hidden="true" />{item.label}</span><b>{item.count}</b><i className="bar" aria-hidden="true"><i style={{ width: `${graph.nodes.length ? item.count / graph.nodes.length * 100 : 0}%` }} /></i></div>)}</div>
      </section>
      <section className="health-card hubs-card">
        <div className="card-title"><div><p className="section-kicker">{copy.navigation}</p><h3>{copy.mostConnected}</h3></div><span>{copy.top} {hubs.length}</span></div>
        <div className="hub-list">{hubs.map(({ node, connections }, index) => <button key={node.id} onClick={() => onOpenPage(node.id)}>
          <span className="hub-rank">{String(index + 1).padStart(2, "0")}</span>
          <span><strong>{node.title}</strong><small>{kindLabel(copy, node.kind)} · {node.path}</small></span>
          <b>{connections}</b>
        </button>)}</div>
      </section>
    </div>
  </div>;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function proposalCommands(proposal: ProposalInboxItem, copy: ReviewCopy, demo: boolean): Array<{ label: string; command: string }> {
  const file = demo ? "<proposal.json>" : shellQuote(proposal.file);
  const id = demo ? "<proposal-id>" : proposal.id;
  if (proposal.status === "proposed") return [
    { label: copy.reviewCommand, command: `lwc proposal review ${file} --approve ${id} --reviewer "<name>"` },
    { label: copy.rejectCommand, command: `lwc proposal reject ${file} --confirm ${id} --reason "<reason>"` },
  ];
  if (proposal.status === "reviewed") return [
    { label: copy.applyCommand, command: `lwc proposal apply ${file} "<vault>" --confirm ${id}` },
  ];
  return [];
}

function Lifecycle({ proposal, copy }: { proposal: ProposalInboxItem; copy: ReviewCopy }) {
  const applied = proposal.status === "applied";
  const reviewed = proposal.status === "reviewed" || applied;
  const rejected = proposal.status === "rejected";
  return <ol className={`lifecycle ${rejected ? "rejected" : ""}`} aria-label={copy.lifecycle}>
    <li className="complete"><i aria-hidden="true">✓</i><span><strong>{copy.proposed}</strong><small>{readableDate(proposal.createdAt)}</small></span></li>
    {rejected ? <li className="current rejected"><i aria-hidden="true">×</i><span><strong>{copy.rejected}</strong><small>{proposal.rejection ? readableDate(proposal.rejection.rejectedAt) : copy.decisionRecorded}</small></span></li> : <>
      <li className={reviewed ? "complete" : "current"}><i aria-hidden="true">{reviewed ? "✓" : "2"}</i><span><strong>{copy.reviewed}</strong><small>{proposal.review ? readableDate(proposal.review.reviewedAt) : copy.humanDecision}</small></span></li>
      <li className={applied ? "complete" : reviewed ? "current" : "pending"}><i aria-hidden="true">{applied ? "✓" : "3"}</i><span><strong>{copy.applied}</strong><small>{proposal.application ? readableDate(proposal.application.appliedAt) : copy.unchanged}</small></span></li>
    </>}
  </ol>;
}

function TopologyPreview({ proposal, copy }: { proposal: ProposalInboxItem; copy: ReviewCopy }) {
  const { addedLinks, removedLinks, conflicts } = proposal.topology;
  const linkChanges = addedLinks.length + removedLinks.length;
  return <section className={`topology-preview ${conflicts.length ? "has-conflicts" : ""}`} data-testid="topology-preview">
    <div className="topology-heading">
      <div><p className="section-kicker">{copy.relationshipImpact}</p><h3>{copy.blueprint}</h3></div>
      <div className="topology-totals" aria-label={copy.impactTotals}>
        <span><b>{proposal.changes.length}</b> {copy.pages}</span>
        <span><b>{linkChanges}</b> {copy.links}</span>
        <span className={conflicts.length ? "danger" : "safe"}><b>{conflicts.length}</b> {copy.conflicts}</span>
      </div>
    </div>
    {conflicts.length > 0 && <div className="conflict-banner" role="alert"><strong>{copy.targetChanged}</strong><span>{copy.reviewAgain}: {conflicts.join(", ")}</span></div>}
    <div className="topology-board">
      <div className="changed-pages">
        <span className="blueprint-label">{copy.changedPages}</span>
        {proposal.changes.map((change) => <div className={`page-chip ${change.targetState}`} key={change.path}>
          <i aria-hidden="true" />
          <span><strong>{change.path}</strong><small>{copy.operations[change.operation]} · {change.targetState === "unchanged" ? copy.baseVerified : change.targetState === "matches-proposal" ? copy.matchesProposal : copy.hashConflict}</small></span>
        </div>)}
      </div>
      <div className="topology-links">
        <span className="blueprint-label">{copy.relationshipDelta}</span>
        {addedLinks.map((link) => <div className="topology-link added" key={`add-${link.source}-${link.kind}-${link.target}`}>
          <span className="link-sign">+</span><code>{link.source}</code><span className="link-arrow">→</span><strong>{link.target}</strong><small>{copy.linkKinds[link.kind]}</small>
        </div>)}
        {removedLinks.map((link) => <div className="topology-link removed" key={`remove-${link.source}-${link.kind}-${link.target}`}>
          <span className="link-sign">−</span><code>{link.source}</code><span className="link-arrow">→</span><strong>{link.target}</strong><small>{copy.linkKinds[link.kind]}</small>
        </div>)}
        {linkChanges === 0 && <div className="topology-stable"><span>＝</span><div><strong>{copy.noRelationshipChanges}</strong><small>{copy.contentOnly}</small></div></div>}
      </div>
    </div>
    <div className="topology-legend"><span><i className="amber" aria-hidden="true" />{copy.pageChanged}</span><span><i className="green" aria-hidden="true" />{copy.linkAdded}</span><span><i className="red" aria-hidden="true" />{copy.linkRemoved}</span></div>
  </section>;
}

function ProposalDossier({ proposal, copy, demo }: { proposal: ProposalInboxItem; copy: ReviewCopy; demo: boolean }) {
  const commands = proposalCommands(proposal, copy, demo);
  return <article className="proposal-dossier" data-testid="proposal-dossier">
    <header className="dossier-header">
      <div><p className="section-kicker">{proposal.id}</p><h2>{proposal.summary}</h2></div>
      <span className={`proposal-status ${proposal.status}`}>{copy.proposalStatus[proposal.status]}</span>
    </header>

    <Lifecycle proposal={proposal} copy={copy} />

    {proposal.intake && <section className="intake-provenance" aria-label={copy.sourceIntakeProvenance}>
      <div><p className="section-kicker">{copy.sourceProvenance}</p><h3>{proposal.intake.sourceName}</h3></div>
      <dl><div><dt>{copy.intake}</dt><dd><code>{proposal.intake.id}</code></dd></div><div><dt>{copy.sourceHash}</dt><dd><code>{proposal.intake.sourceHash}</code></dd></div><div><dt>{copy.declaredTarget}</dt><dd><code>{proposal.intake.target}</code></dd></div>{proposal.intake.generator && <div><dt>{copy.generator}</dt><dd>{proposal.intake.generator}</dd></div>}</dl>
    </section>}

    <TopologyPreview proposal={proposal} copy={copy} />

    {(proposal.review || proposal.rejection || proposal.application) && <section className="decision-record">
      <h3>{copy.decisionRecord}</h3>
      {proposal.review && <dl><div><dt>{copy.reviewer}</dt><dd>{proposal.review.reviewer}</dd></div><div><dt>{copy.reviewNote}</dt><dd>{proposal.review.note || "—"}</dd></div><div><dt>{copy.reviewHash}</dt><dd><code>{proposal.review.reviewHash}</code></dd></div></dl>}
      {proposal.rejection && <p><strong>{copy.reason}:</strong> {proposal.rejection.reason}</p>}
      {proposal.application && <p>{copy.appliedAt} <code>{proposal.application.appliedAt}</code>.</p>}
    </section>}

    <section className="file-review">
      <div className="review-heading"><div><p className="section-kicker">{copy.exactDiff}</p><h3>{proposal.changes.length} {proposal.changes.length === 1 ? copy.changedFile : copy.changedFiles}</h3></div><span>{copy.readOnlyEvidence}</span></div>
      {proposal.changes.map((change, index) => <details key={change.path} open={index === 0}>
        <summary><span className={`operation ${change.operation}`}>{copy.operations[change.operation]}</span><strong>{change.path}</strong><small>{change.diff.filter((line) => line.kind === "add").length}+ · {change.diff.filter((line) => line.kind === "remove").length}−</small></summary>
        <div className={`hash-pair ${change.targetState === "conflict" ? "conflict" : ""}`}><div><span>{copy.baseHash}</span><code>{change.baseHash ?? copy.missing}</code></div><div><span>{copy.proposedHash}</span><code>{change.contentHash}</code></div>{change.targetState === "conflict" && <div><span>{copy.currentHash}</span><code>{change.currentHash ?? copy.missing}</code></div>}</div>
        <pre className="diff-block" aria-label={`${copy.diffFor} ${change.path}`}>{change.diff.map((line, lineIndex) => <span className={line.kind} key={`${line.kind}-${lineIndex}`}><b>{line.kind === "add" ? "+" : line.kind === "remove" ? "−" : " "}</b>{line.text || " "}</span>)}</pre>
      </details>)}
    </section>

    {commands.length > 0 && <section className="next-step">
      <div><p className="section-kicker">{demo ? copy.commandTemplate : copy.safeNextStep}</p><h3>{demo ? copy.demoNoDecision : copy.noDecision}</h3><p>{demo ? copy.demoCommandHelp : copy.commandHelp}</p></div>
      <div className="command-list">{commands.map((item) => <div key={item.label}><span>{item.label}</span><code>{item.command}</code></div>)}</div>
    </section>}
  </article>;
}

function ChangesView({ inbox, error, copy, demo }: { inbox?: ProposalInbox; error?: string; copy: ReviewCopy; demo: boolean }) {
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all");
  const [selectedId, setSelectedId] = useState<string>();
  const proposals = inbox?.proposals ?? [];
  const filtered = proposals.filter((proposal) => filter === "all" || (filter === "open" ? ["proposed", "reviewed"].includes(proposal.status) : ["applied", "rejected"].includes(proposal.status)));

  useEffect(() => {
    if (!filtered.some((proposal) => proposal.id === selectedId)) setSelectedId(filtered[0]?.id);
  }, [filter, inbox, selectedId]);
  const selected = proposals.find((proposal) => proposal.id === selectedId);

  if (error) return <div className="changes-unavailable" data-testid="changes-view"><div className="empty-symbol issue">!</div><p className="section-kicker">{copy.inboxUnavailable}</p><h2>{copy.proposalReadFailed}</h2><p>{error}</p></div>;
  if (!inbox) return <div className="changes-unavailable" data-testid="changes-view"><div className="loading-mark" /><p className="section-kicker">{copy.readingProposals}</p><h2>{copy.openingQueue}</h2></div>;

  return <div className="changes-view" data-testid="changes-view">
    <aside className="inbox-panel">
      <header><div><p className="section-kicker">{copy.agentChanges}</p><h2>{copy.inbox}</h2></div><strong>{proposals.length}</strong></header>
      <div className="inbox-filters" role="group" aria-label={copy.filterProposals}>
        <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>{copy.all}</button>
        <button className={filter === "open" ? "active" : ""} onClick={() => setFilter("open")}>{copy.open}</button>
        <button className={filter === "closed" ? "active" : ""} onClick={() => setFilter("closed")}>{copy.closed}</button>
      </div>
      <div className="proposal-list">
        {filtered.map((proposal) => <button key={proposal.id} className={proposal.id === selectedId ? "active" : ""} onClick={() => setSelectedId(proposal.id)}>
          <span className={`proposal-status ${proposal.status}`}>{copy.proposalStatus[proposal.status]}</span>
          <strong>{proposal.summary}</strong>
          <small>{proposal.changes.length} {proposal.changes.length === 1 ? copy.file : copy.files} · {readableDate(proposal.createdAt)}</small>
          <code>{proposal.id}</code>
        </button>)}
        {!filtered.length && <div className="inbox-empty"><strong>{proposals.length ? copy.noProposalsState : copy.noProposals}</strong><p>{proposals.length ? copy.chooseFilter : copy.proposalsBoundary}</p>{!proposals.length && <code>lwc proposal create &lt;vault&gt; --from &lt;draft&gt;</code>}</div>}
      </div>
      {inbox.issues.length > 0 && <section className="inbox-issues"><h3>{copy.unreadableFiles} <span>{inbox.issues.length}</span></h3>{inbox.issues.map((issue) => <div key={issue.file}><strong>{issue.file}</strong><small>{issue.message}</small></div>)}</section>}
    </aside>
    <div className="dossier-panel">{selected ? <ProposalDossier proposal={selected} copy={copy} demo={demo} /> : <div className="dossier-empty"><span>←</span><p>{copy.selectProposal}</p></div>}</div>
  </div>;
}

function DraftRelay({ draft, copy }: { draft: DraftInboxItem; copy: ReviewCopy }) {
  const sourceComplete = draft.source.state === "verified" && draft.source.snapshotState === "verified";
  const draftComplete = draft.draft.state === "edited" && draft.draft.scope === "declared-only";
  const proposalComplete = draft.proposal?.state === "verified";
  return <ol className="evidence-relay" aria-label={copy.sourceChain}>
    <li className={sourceComplete ? "complete" : "blocked"}><i aria-hidden="true">{sourceComplete ? "✓" : "!"}</i><span><b>01</b><strong>{copy.source}</strong><small>{sourceComplete ? copy.sourceVerified : copy.evidenceAttention}</small></span></li>
    <li className={draftComplete ? "complete current" : draft.state === "blocked" ? "blocked current" : "current"}><i aria-hidden="true">{draftComplete ? "✓" : draft.state === "blocked" ? "!" : "2"}</i><span><b>02</b><strong>{copy.draft}</strong><small>{draft.draft.state === "edited" ? draft.draft.scope === "declared-only" ? copy.isolatedEdit : copy.scopeExpanded : draft.draft.state === "placeholder" ? copy.placeholder : copy.draftMissing}</small></span></li>
    <li className={proposalComplete ? "complete" : "pending"}><i aria-hidden="true">{proposalComplete ? "✓" : "3"}</i><span><b>03</b><strong>{copy.proposal}</strong><small>{proposalComplete ? copy.provenanceVerified : copy.notInQueue}</small></span></li>
  </ol>;
}

function EvidenceBadge({ state, label, copy }: { state: EvidenceState; label: string; copy: ReviewCopy }) {
  return <span className={`evidence-badge ${state}`}><i aria-hidden="true" />{label} {copy.evidenceStatus[state]}</span>;
}

function DraftDossier({ draft, copy, demo }: { draft: DraftInboxItem; copy: ReviewCopy; demo: boolean }) {
  const nextCommand = demo ? "lwc intake propose <intake.json> <vault> --summary \"Explain why this knowledge belongs in the Vault\"" : `lwc intake propose '${draft.file.replaceAll("'", "'\\''")}' . --summary "Explain why this knowledge belongs in the Vault"`;
  return <article className="draft-dossier" data-testid="draft-dossier">
    <header className="dossier-header draft-header">
      <div><p className="section-kicker">{copy.declaredKnowledgeTarget}</p><h2>{draft.draft.path}</h2><p>{draft.source.name} <span>→</span> {draft.target.operation === "create" ? copy.newPage : draft.target.operation === "update" ? copy.existingPage : copy.unsafeTarget}</p></div>
      <span className={`draft-state ${draft.state}`}>{copy.draftStatus[draft.state]}</span>
    </header>

    <DraftRelay draft={draft} copy={copy} />

    {draft.blockers.length > 0 && <section className="draft-blockers" role="alert"><div><strong>{copy.evidenceGate}</strong><span>{draft.blockers.length} {draft.blockers.length === 1 ? copy.issue : copy.issues}</span></div><ul>{draft.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></section>}

    <section className="evidence-ledger">
      <header><div><p className="section-kicker">{copy.evidenceLedger}</p><h3>{copy.receivedProduced}</h3></div><span>{demo ? copy.readOnlyDemo : copy.readOnlyLocal}</span></header>
      <div className="ledger-grid">
        <dl>
          <div><dt>{copy.originalSource}</dt><dd><code>{draft.source.path}</code><EvidenceBadge state={draft.source.state} label={copy.original} copy={copy} /></dd></div>
          <div><dt>{copy.capturedCopy}</dt><dd><code>{draft.source.snapshot}</code><EvidenceBadge state={draft.source.snapshotState} label={copy.snapshot} copy={copy} /></dd></div>
          <div><dt>{copy.sourceHash}</dt><dd><code>{draft.source.sha256}</code></dd></div>
        </dl>
        <dl>
          <div><dt>{copy.generator}</dt><dd>{draft.generator ?? copy.notRecorded}</dd></div>
          <div><dt>{copy.created}</dt><dd><code>{draft.createdAt}</code></dd></div>
          <div><dt>{copy.draftScope}</dt><dd><span className={`scope-state ${draft.draft.scope}`}>{draft.draft.scope === "declared-only" ? copy.oneTarget : copy.expandedTarget}</span></dd></div>
        </dl>
      </div>
    </section>

    <section className="evidence-compare">
      <article><header><span>{copy.sourceSnapshot}</span><EvidenceBadge state={draft.source.snapshotState} label={copy.copy} copy={copy} /></header><pre>{draft.source.snapshotContent ?? copy.snapshotUnavailable}</pre><footer><code>{draft.source.sha256}</code></footer></article>
      <article className="generated"><header><span>{copy.isolatedDraft}</span><span className={`draft-edit-state ${draft.draft.state}`}>{copy.draftEditStates[draft.draft.state]}</span></header><pre>{draft.draft.content ?? copy.draftUnavailable}</pre><footer><code>{draft.draft.currentHash ?? copy.noDraftHash}</code></footer></article>
    </section>

    <section className={`draft-next-step ${draft.state}`}>
      <div><p className="section-kicker">{demo ? copy.commandTemplate : copy.safeNextStep}</p><h3>{draft.state === "ready" ? copy.promote : draft.state === "needs-draft" ? copy.writeFirst : draft.state === "proposed" ? copy.continueChanges : copy.repairEvidence}</h3><p>{demo ? copy.demoCommandHelp : draft.state === "ready" ? copy.promoteHelp : draft.state === "needs-draft" ? copy.editHelp(draft.draft.path) : draft.state === "proposed" ? copy.proposedHelp(draft.proposal?.id ?? copy.unavailable) : copy.blockedHelp}</p></div>
      {draft.state === "ready" && <code>{nextCommand}</code>}
      {draft.state === "needs-draft" && <code>{draft.file.replace(/intake\.json$/, draft.draft.path)}</code>}
      {draft.state === "proposed" && draft.proposal && <code>{draft.proposal.file}</code>}
    </section>
  </article>;
}

function DraftsView({ inbox, error, copy, demo }: { inbox?: DraftInbox; error?: string; copy: ReviewCopy; demo: boolean }) {
  const [filter, setFilter] = useState<"all" | "actionable" | "proposed">("all");
  const [selectedId, setSelectedId] = useState<string>();
  const drafts = inbox?.drafts ?? [];
  const filtered = drafts.filter((draft) => filter === "all" || (filter === "actionable" ? draft.state !== "proposed" : draft.state === "proposed"));

  useEffect(() => {
    if (!filtered.some((draft) => draft.id === selectedId)) setSelectedId(filtered[0]?.id);
  }, [filter, inbox, selectedId]);
  const selected = drafts.find((draft) => draft.id === selectedId);

  if (error) return <div className="changes-unavailable" data-testid="drafts-view"><div className="empty-symbol issue">!</div><p className="section-kicker">{copy.draftsUnavailable}</p><h2>{copy.intakeReadFailed}</h2><p>{error}</p></div>;
  if (!inbox) return <div className="changes-unavailable" data-testid="drafts-view"><div className="loading-mark violet" /><p className="section-kicker">{copy.readingIntake}</p><h2>{copy.verifyingChain}</h2></div>;

  return <div className="drafts-view" data-testid="drafts-view">
    <aside className="inbox-panel draft-inbox">
      <header><div><p className="section-kicker">{copy.sourceIntake}</p><h2>{copy.drafts}</h2></div><strong>{drafts.length}</strong></header>
      <div className="inbox-filters" role="group" aria-label={copy.filterDrafts}>
        <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>{copy.all}</button>
        <button className={filter === "actionable" ? "active" : ""} onClick={() => setFilter("actionable")}>{copy.active}</button>
        <button className={filter === "proposed" ? "active" : ""} onClick={() => setFilter("proposed")}>{copy.proposedFilter}</button>
      </div>
      <div className="proposal-list draft-list">
        {filtered.map((draft) => <button key={draft.id} className={draft.id === selectedId ? "active" : ""} onClick={() => setSelectedId(draft.id)}>
          <span className={`draft-state ${draft.state}`}>{copy.draftStatus[draft.state]}</span>
          <strong>{draft.draft.path}</strong>
          <small>{draft.source.name} · {draft.generator ?? copy.unknownGenerator}</small>
          <code>{draft.id}</code>
        </button>)}
        {!filtered.length && <div className="inbox-empty"><strong>{drafts.length ? copy.noIntakesState : copy.noIntakes}</strong><p>{drafts.length ? copy.chooseFilter : copy.captureSource}</p>{!drafts.length && <code>lwc intake create &lt;source&gt; &lt;vault&gt; --target &lt;page.md&gt;</code>}</div>}
      </div>
      {inbox.issues.length > 0 && <section className="inbox-issues"><h3>{copy.unreadableIntakes} <span>{inbox.issues.length}</span></h3>{inbox.issues.map((issue) => <div key={issue.file}><strong>{issue.file}</strong><small>{issue.message}</small></div>)}</section>}
    </aside>
    <div className="dossier-panel">{selected ? <DraftDossier draft={selected} copy={copy} demo={demo} /> : <div className="dossier-empty"><span className="violet-arrow">←</span><p>{copy.selectIntake}</p></div>}</div>
  </div>;
}

export function App() {
  const [graph, setGraph] = useState<WikiGraph>();
  const [error, setError] = useState<string>();
  const [inbox, setInbox] = useState<ProposalInbox>();
  const [inboxError, setInboxError] = useState<string>();
  const [drafts, setDrafts] = useState<DraftInbox>();
  const [draftsError, setDraftsError] = useState<string>();
  const [view, setView] = useState<WorkbenchView>(() => workbenchViewFromSearch(location.search));
  const [selectedId, setSelectedId] = useState<string>();
  const params = new URLSearchParams(location.search);
  const live = params.get("live") === "1";
  const locale = detectViewerLocale(location.search, navigator.languages);
  const copy = UI_COPY[locale];
  const reviewCopy = REVIEW_COPY[locale];
  const graphSource = params.get("graph") ?? new URL(live ? "./graph.json" : locale === "zh-CN" ? "./agent-trends-zh.json" : "./graph.json", document.baseURI).toString();
  const inboxSource = live ? "/__lwc/proposals" : new URL(locale === "zh-CN" ? "./demo-proposals-zh.json" : "./demo-proposals.json", document.baseURI).toString();
  const draftsSource = live ? "/__lwc/drafts" : new URL(locale === "zh-CN" ? "./demo-drafts-zh.json" : "./demo-drafts.json", document.baseURI).toString();

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = locale === "zh-CN" ? "LLM Wiki Canvas — Agent 知识变更审查" : "LLM Wiki Canvas — Agent Knowledge Change Review";
  }, [locale]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(graphSource, { cache: "no-store" });
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
      try {
        const response = await fetch(inboxSource, { cache: "no-store" });
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
      try {
        const response = await fetch(draftsSource, { cache: "no-store" });
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
  }, [draftsSource, graphSource, inboxSource, live]);

  if (error) return <main className="status-screen"><div className="status-mark">!</div><p className="section-kicker">{copy.graphUnavailable}</p><h1>{copy.graphFailed}</h1><p>{error}</p><code>pnpm demo:build</code></main>;
  if (!graph) return <main className="status-screen"><div className="loading-mark" /><p className="section-kicker">{copy.reading}</p><h1>{copy.opening}</h1></main>;

  const selectView = (next: WorkbenchView) => {
    setView(next);
    const url = new URL(location.href);
    if (next === "map") url.searchParams.delete("view"); else url.searchParams.set("view", next);
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };
  const switchToPage = (id: string) => { setSelectedId(id); selectView("map"); };
  const openChanges = inbox?.proposals.filter((proposal) => proposal.status === "proposed" || proposal.status === "reviewed").length ?? 0;
  const activeDrafts = drafts?.drafts.filter((draft) => draft.state !== "proposed").length ?? 0;
  const viewTitle = view === "map" ? copy.mapTitle : view === "health" ? copy.healthTitle : view === "drafts" ? copy.draftsTitle : copy.changesTitle;

  return <main className="workbench-shell">
    <a className="skip-link" href="#workspace-content">{copy.skip}</a>
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark" aria-hidden="true"><i /><i /></span><div><strong>LLM Wiki Canvas</strong><small>{copy.localWorkbench}</small></div></div>
      <div className="vault-label"><span>{copy.vaultLabel}</span><strong>{graph.rootName}</strong></div>
      <AppNavigation view={view} onView={selectView} drafts={activeDrafts} changes={openChanges} live={live} copy={copy} />
      <div className="sidebar-note"><span className="status-dot" aria-hidden="true" /><div><strong>{live ? copy.watchingSource : copy.demoEvidence}</strong><small>{live ? copy.liveProjection : copy.demoEvidenceDescription}</small></div></div>
    </aside>

    <section className={`workbench ${live ? "is-live" : "is-demo"}`} id="workspace-content">
      <header className="topbar">
        <div className="mobile-brand"><span className="brand-mark" aria-hidden="true"><i /><i /></span><strong>{graph.rootName}</strong></div>
        <div className="breadcrumb"><span>{graph.rootName}</span><b>/</b><strong>{viewTitle}</strong></div>
        <div className="evidence-route" aria-label={copy.evidenceWorkflow}><span>{copy.markdown}</span><i aria-hidden="true" /> <span>{copy.map}</span><i aria-hidden="true" /> <strong>{copy.review}</strong></div>
        <a className="locale-switch" href={localeHref(locale)} hrefLang={locale === "en" ? "zh-CN" : "en"}>{copy.languageName}</a>
        <div className="topbar-meta">{graph.okf && <span className="okf-version">OKF {graph.okf.version}</span>}<span className="status-dot" aria-hidden="true" />{live ? copy.live : copy.generated} {readableDate(graph.generatedAt)}</div>
      </header>
      {!live && view === "map" && <ProductThesis copy={copy} locale={locale} />}
      {!live && <section className="demo-disclosure" aria-label={copy.demoTitle}><div><strong>{copy.demoTitle}</strong><span>{copy.demoDescription}</span></div><code>npm i -g llm-wiki-canvas</code><a href={locale === "zh-CN" ? "https://github.com/chicogong/llm-wiki-canvas/blob/main/README.zh-CN.md#快速开始" : "https://github.com/chicogong/llm-wiki-canvas#quick-start"}>{copy.quickStart}</a></section>}
      {live ? <h1 className="sr-only">{viewTitle}</h1> : <h2 className="sr-only">{viewTitle}</h2>}
      <div className="mobile-nav"><AppNavigation view={view} onView={selectView} drafts={activeDrafts} changes={openChanges} live={live} copy={copy} /></div>
      {view === "map" && <MapView graph={graph} selectedId={selectedId} onSelect={setSelectedId} copy={copy} />}
      {view === "health" && <HealthView graph={graph} onOpenPage={switchToPage} copy={copy} />}
      {view === "drafts" && <DraftsView inbox={drafts} error={draftsError} copy={reviewCopy} demo={!live} />}
      {view === "changes" && <ChangesView inbox={inbox} error={inboxError} copy={reviewCopy} demo={!live} />}
    </section>
  </main>;
}
