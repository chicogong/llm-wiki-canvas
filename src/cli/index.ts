#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import { Command } from "commander";
import {
  applyKnowledgeProposal,
  applyAgentScaffold,
  agentCompatibilityToMarkdown,
  agentScaffoldToMarkdown,
  buildGraph,
  buildKnowledgeContext,
  buildWikiReport,
  checkOkfBundle,
  createKnowledgeIntake,
  createKnowledgeProposal,
  graphToCanvas,
  graphToExcalidraw,
  graphToMermaid,
  inspectAgentCompatibility,
  intakeToMarkdown,
  knowledgeContextToMarkdown,
  okfReportToMarkdown,
  parseKnowledgeProposal,
  parseAgentHosts,
  planAgentScaffold,
  proposalToMarkdown,
  proposeKnowledgeIntake,
  rejectKnowledgeProposal,
  reportToMarkdown,
  readKnowledgeIntake,
  reviewKnowledgeProposal,
  selectFocusedGraph,
  summarizeCanvasLayout,
  summarizeExcalidrawLayout,
  type ExcalidrawDocument,
  type JsonCanvas,
  type LayoutSummary,
  type KnowledgeProposal,
  type AgentScaffoldTemplates,
  type NodeKind,
} from "../core/index.js";
import { startWikiServer } from "./serve.js";

async function writeJson(target: string, value: unknown): Promise<void> {
  const absolute = path.resolve(target);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(target: string, value: string): Promise<void> {
  const absolute = path.resolve(target);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, value.endsWith("\n") ? value : `${value}\n`, "utf8");
}

async function readCanvas(target?: string): Promise<JsonCanvas | undefined> {
  if (!target) return undefined;
  try {
    return JSON.parse(await readFile(path.resolve(target), "utf8")) as JsonCanvas;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function readExcalidraw(target?: string): Promise<ExcalidrawDocument | undefined> {
  if (!target) return undefined;
  try {
    return JSON.parse(await readFile(path.resolve(target), "utf8")) as ExcalidrawDocument;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function printLayoutSummary(summary: LayoutSummary): void {
  console.log(`Layout ${summary.preserved} preserved · ${summary.added} new · ${summary.annotations} annotation(s)`);
}

function printRemovedPages(summary: LayoutSummary): void {
  if (summary.removed.length) console.log(`Removing from generated view: ${summary.removed.join(", ")}`);
}

async function readProposal(target: string): Promise<KnowledgeProposal> {
  try {
    return parseKnowledgeProposal(JSON.parse(await readFile(path.resolve(target), "utf8")));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`Proposal is not valid JSON: ${target}`);
    throw error;
  }
}

async function readScaffoldTemplates(): Promise<AgentScaffoldTemplates> {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.resolve(moduleDirectory, "../.."), path.resolve(moduleDirectory, "..")];
  for (const root of candidates) {
    const skillRoot = path.join(root, ".agents", "skills", "llm-wiki-canvas");
    try {
      const [skill, metadata, contract] = await Promise.all([
        readFile(path.join(skillRoot, "SKILL.md"), "utf8"),
        readFile(path.join(skillRoot, "agents", "openai.yaml"), "utf8"),
        readFile(path.join(skillRoot, "references", "wiki-contract.md"), "utf8"),
      ]);
      return { skill, metadata, contract };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error("Packaged Agent Skill templates are missing; reinstall llm-wiki-canvas");
}

function generatedAt(value?: string): Date {
  if (!value) return new Date();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid --generated-at value: ${value}`);
  return date;
}

function focusedOutput(title: string, format: "mermaid" | "excalidraw"): string {
  const slug = title.normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLocaleLowerCase() || "focused";
  return `${slug}.${format === "mermaid" ? "mmd" : "excalidraw"}`;
}

const program = new Command()
  .name("llm-wiki-canvas")
  .alias("lwc")
  .description("Compile a local Markdown wiki into a graph and Obsidian JSON Canvas")
  .version("0.1.0");

program.command("scan")
  .argument("[root]", "wiki root", ".")
  .option("-o, --output <file>", "graph JSON output", ".lwc/graph.json")
  .description("Scan Markdown and emit a deterministic relationship graph")
  .action(async (root, options) => {
    const graph = await buildGraph(root);
    await writeJson(options.output, graph);
    console.log(`Scanned ${graph.stats.files} files, ${graph.stats.links} links → ${options.output}`);
    if (graph.stats.brokenLinks) console.log(`${graph.stats.brokenLinks} broken link(s); run lwc lint ${root}`);
  });

program.command("lint")
  .argument("[root]", "wiki root", ".")
  .option("--strict", "exit non-zero on warnings too", false)
  .description("Report broken and ambiguous wiki relationships")
  .action(async (root, options) => {
    const graph = await buildGraph(root);
    for (const item of graph.diagnostics) {
      console.log(`${item.level.toUpperCase()} ${item.code} ${item.path}: ${item.message}`);
    }
    console.log(`${graph.stats.files} files · ${graph.stats.links} links · ${graph.diagnostics.length} diagnostic(s)`);
    const failed = graph.diagnostics.some((item) => item.level === "error" || options.strict);
    if (failed) process.exitCode = 1;
  });

program.command("report")
  .argument("[root]", "wiki root", ".")
  .option("-o, --output <file>", "write the report to a file instead of stdout")
  .option("--format <format>", "report format: markdown or json", "markdown")
  .option("--top <count>", "number of most-connected pages to include", "5")
  .option("--generated-at <iso>", "fixed ISO timestamp for reproducible report output")
  .description("Summarize measurable wiki structure, provenance, and diagnostics")
  .action(async (root, options) => {
    if (!["markdown", "json"].includes(options.format)) throw new Error(`Invalid --format value: ${options.format}`);
    const top = Number.parseInt(options.top, 10);
    if (!Number.isInteger(top) || top < 0) throw new Error(`Invalid --top value: ${options.top}`);
    const fixedTime = options.generatedAt ? generatedAt(options.generatedAt) : undefined;
    const report = buildWikiReport(await buildGraph(root, fixedTime ?? new Date(), fixedTime), top);
    const output = options.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : reportToMarkdown(report);
    if (options.output) {
      await writeText(options.output, output);
      console.log(`Report → ${options.output}`);
    } else {
      process.stdout.write(output);
    }
  });

program.command("context")
  .argument("[root]", "wiki root", ".")
  .requiredOption("--focus <page>", "focus page title, ID, or relative Markdown path")
  .option("--depth <number>", "relationship depth: 0, 1, or 2", "1")
  .option("--direction <direction>", "both, incoming, or outgoing", "both")
  .option("--kind <kind...>", "neighbor page kinds: index, concept, source, note")
  .option("--max-pages <count>", "maximum included pages, from 1 to 50", "8")
  .option("--max-words <count>", "maximum included Markdown words, from 1 to 100000", "2000")
  .option("--format <format>", "markdown or json", "markdown")
  .option("-o, --output <file>", "write the context bundle to a file instead of stdout")
  .description("Export a bounded, source-cited Markdown context bundle for an Agent")
  .action(async (root, options) => {
    const depth = Number.parseInt(options.depth, 10);
    const maxPages = Number.parseInt(options.maxPages, 10);
    const maxWords = Number.parseInt(options.maxWords, 10);
    if (![0, 1, 2].includes(depth) || String(depth) !== String(options.depth)) throw new Error(`Context depth must be 0, 1, or 2: ${options.depth}`);
    if (!Number.isInteger(maxPages) || String(maxPages) !== String(options.maxPages)) throw new Error(`Invalid context max pages: ${options.maxPages}`);
    if (!Number.isInteger(maxWords) || String(maxWords) !== String(options.maxWords)) throw new Error(`Invalid context max words: ${options.maxWords}`);
    if (!["both", "incoming", "outgoing"].includes(options.direction)) throw new Error(`Invalid context direction: ${options.direction}`);
    if (!["markdown", "json"].includes(options.format)) throw new Error(`Invalid context format: ${options.format}`);
    const allowedKinds = new Set<NodeKind>(["index", "concept", "source", "note"]);
    const kinds = options.kind?.map((kind: string) => kind.toLocaleLowerCase()) as NodeKind[] | undefined;
    const invalidKinds = kinds?.filter((kind) => !allowedKinds.has(kind)) ?? [];
    if (invalidKinds.length) throw new Error(`Invalid context page kind: ${invalidKinds.join(", ")}`);
    const graph = await buildGraph(root);
    const bundle = await buildKnowledgeContext(root, graph, options.focus, {
      depth: depth as 0 | 1 | 2,
      direction: options.direction,
      kinds,
      maxPages,
      maxWords,
    });
    const output = options.format === "json" ? `${JSON.stringify(bundle, null, 2)}\n` : knowledgeContextToMarkdown(bundle);
    if (options.output) {
      await writeText(options.output, output);
      console.log(`Context ${bundle.summary.selectedPages} pages, ${bundle.summary.includedWords} words around ${bundle.focus.path} → ${options.output}`);
    } else {
      process.stdout.write(output);
    }
  });

const okf = program.command("okf")
  .description("Inspect Open Knowledge Format bundles without executing their runtime contracts");

okf.command("check")
  .argument("[root]", "OKF bundle root", ".")
  .option("-o, --output <file>", "write the conformance report to a file instead of stdout")
  .option("--format <format>", "report format: markdown or json", "markdown")
  .option("--strict", "exit non-zero on warnings too", false)
  .description("Validate the file and frontmatter contract for an OKF v0.2 bundle")
  .action(async (root, options) => {
    if (!["markdown", "json"].includes(options.format)) throw new Error(`Invalid --format value: ${options.format}`);
    const report = await checkOkfBundle(root);
    const output = options.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : okfReportToMarkdown(report);
    if (options.output) {
      await writeText(options.output, output);
      console.log(`OKF v0.2 conformance → ${options.output}`);
    } else {
      process.stdout.write(output);
    }
    if (!report.conformant || (options.strict && report.summary.warnings > 0)) process.exitCode = 1;
  });

program.command("agents")
  .argument("[root]", "workspace root containing Agent integration files", ".")
  .option("-o, --output <file>", "write the compatibility report to a file instead of stdout")
  .option("--format <format>", "report format: markdown or json", "markdown")
  .option("--strict", "exit non-zero when a required host integration is incomplete", false)
  .description("Verify cross-Agent repository rules and Skill entry points")
  .action(async (root, options) => {
    if (!["markdown", "json"].includes(options.format)) throw new Error(`Invalid --format value: ${options.format}`);
    const report = await inspectAgentCompatibility(root);
    const output = options.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : agentCompatibilityToMarkdown(report);
    if (options.output) {
      await writeText(options.output, output);
      console.log(`Agent compatibility → ${options.output}`);
    } else {
      process.stdout.write(output);
    }
    if (options.strict && report.summary.incomplete > 0) process.exitCode = 1;
  });

program.command("init")
  .argument("[root]", "workspace root for Agent integration", ".")
  .option("--agents <hosts>", "comma-separated hosts: codex, claude-code, qoder, trae, workbuddy", "codex,claude-code,qoder,trae,workbuddy")
  .option("--write", "create missing files after a conflict-free dry-run", false)
  .option("-o, --output <file>", "write the setup report to a file instead of stdout")
  .option("--format <format>", "report format: markdown or json", "markdown")
  .description("Preview or create safe cross-Agent repository entry points")
  .action(async (root, options) => {
    if (!["markdown", "json"].includes(options.format)) throw new Error(`Invalid --format value: ${options.format}`);
    const hosts = parseAgentHosts(options.agents);
    const templates = await readScaffoldTemplates();
    const preview = await planAgentScaffold(root, hosts, templates);
    const result = options.write && preview.summary.conflict === 0 ? await applyAgentScaffold(root, hosts, templates) : preview;
    const output = options.format === "json" ? `${JSON.stringify(result, null, 2)}\n` : agentScaffoldToMarkdown(result);
    if (options.output) await writeText(options.output, output);
    else process.stdout.write(output);
    if (options.write && preview.summary.conflict > 0) throw new Error(`Agent scaffold has ${preview.summary.conflict} conflict(s); no integration files were written`);
  });

const intake = program.command("intake")
  .description("Create source-bound drafts and convert them into reviewable proposals");

intake.command("create")
  .argument("[root]", "wiki root", ".")
  .requiredOption("--source <file>", "explicit Markdown or text source file")
  .requiredOption("--target <path>", "intended Markdown path inside the wiki")
  .option("--generator <name>", "Agent, model, or author preparing the draft")
  .option("--created-at <iso>", "fixed ISO timestamp for reproducible fixtures")
  .description("Copy a source snapshot and create an isolated placeholder draft")
  .action(async (root, options) => {
    const createdAt = options.createdAt ? generatedAt(options.createdAt) : new Date();
    const created = await createKnowledgeIntake(root, options.source, options.target, options.generator, createdAt);
    console.log(`Intake ${created.intake.id} → ${created.manifestPath}`);
    console.log(`Source snapshot → ${created.sourceSnapshotPath}`);
    console.log(`Draft target → ${created.draftPath}`);
    console.log(`Edit the draft, then run: lwc intake propose ${created.manifestPath} ${path.resolve(root)}`);
  });

intake.command("show")
  .argument("<intake>", "intake manifest JSON file")
  .description("Show source provenance, draft target, generator, and lifecycle state")
  .action(async (intakeFile) => {
    process.stdout.write(intakeToMarkdown(await readKnowledgeIntake(intakeFile)));
  });

intake.command("propose")
  .argument("<intake>", "intake manifest JSON file")
  .argument("[root]", "wiki root", ".")
  .option("--summary <text>", "short reason for the generated knowledge", "Source-grounded knowledge intake")
  .option("--proposed-at <iso>", "fixed ISO timestamp for reproducible fixtures")
  .description("Validate source and draft integrity, then create a proposal without changing the wiki")
  .action(async (intakeFile, root, options) => {
    const proposedAt = options.proposedAt ? generatedAt(options.proposedAt) : new Date();
    const value = await proposeKnowledgeIntake(root, intakeFile, options.summary, proposedAt);
    const proposalFile = path.join(root, value.intake.proposal?.file ?? "");
    await writeJson(proposalFile, value.proposal);
    await writeJson(intakeFile, value.intake);
    console.log(`Intake ${value.intake.id} → proposal ${value.proposal.id}`);
    console.log(`Proposal → ${proposalFile}`);
    console.log(`Formal Markdown is unchanged; review with: lwc proposal show ${proposalFile}`);
  });

const proposal = program.command("proposal")
  .description("Create, review, reject, and safely apply Markdown knowledge proposals");

proposal.command("create")
  .argument("[root]", "wiki root", ".")
  .requiredOption("--from <directory>", "draft directory whose Markdown paths map into the wiki")
  .option("-o, --output <file>", "proposal JSON output; defaults to <root>/.lwc/proposals/<id>.json")
  .option("--summary <text>", "short reason for the knowledge change", "Knowledge update")
  .option("--created-at <iso>", "fixed ISO timestamp for reproducible proposal fixtures")
  .description("Create a proposed change without modifying the wiki")
  .action(async (root, options) => {
    const createdAt = options.createdAt ? generatedAt(options.createdAt) : new Date();
    const value = await createKnowledgeProposal(root, options.from, options.summary, createdAt);
    const output = options.output ?? path.join(root, ".lwc", "proposals", `${value.id}.json`);
    await writeJson(output, value);
    console.log(`Proposed ${value.changes.length} Markdown change(s) → ${output}`);
    console.log(`Proposal id: ${value.id}`);
    console.log(`Review with: lwc proposal show ${output}`);
  });

proposal.command("show")
  .argument("<proposal>", "proposal JSON file")
  .description("Render proposal metadata, hashes, and a review diff")
  .action(async (proposalFile) => {
    process.stdout.write(proposalToMarkdown(await readProposal(proposalFile)));
  });

proposal.command("review")
  .argument("<proposal>", "proposal JSON file")
  .requiredOption("--approve <proposal-id>", "exact proposal id confirming human review")
  .requiredOption("--reviewer <name>", "person responsible for the review")
  .option("--note <text>", "review note")
  .option("--reviewed-at <iso>", "fixed ISO timestamp for reproducible proposal fixtures")
  .description("Mark a proposed change as reviewed without modifying the wiki")
  .action(async (proposalFile, options) => {
    const reviewedAt = options.reviewedAt ? generatedAt(options.reviewedAt) : new Date();
    const value = reviewKnowledgeProposal(await readProposal(proposalFile), options.approve, options.reviewer, options.note, reviewedAt);
    await writeJson(proposalFile, value);
    console.log(`Reviewed ${value.id}; source files are still unchanged`);
  });

proposal.command("reject")
  .argument("<proposal>", "proposal JSON file")
  .requiredOption("--confirm <proposal-id>", "exact proposal id confirming rejection")
  .requiredOption("--reason <text>", "reason recorded with the rejection")
  .option("--rejected-at <iso>", "fixed ISO timestamp for reproducible proposal fixtures")
  .description("Reject a proposed or reviewed change without modifying the wiki")
  .action(async (proposalFile, options) => {
    const rejectedAt = options.rejectedAt ? generatedAt(options.rejectedAt) : new Date();
    const value = rejectKnowledgeProposal(await readProposal(proposalFile), options.confirm, options.reason, rejectedAt);
    await writeJson(proposalFile, value);
    console.log(`Rejected ${value.id}; source files are unchanged`);
  });

proposal.command("apply")
  .argument("<proposal>", "reviewed proposal JSON file")
  .argument("[root]", "wiki root", ".")
  .requiredOption("--confirm <proposal-id>", "exact reviewed proposal id confirming apply")
  .option("--applied-at <iso>", "fixed ISO timestamp for reproducible proposal fixtures")
  .description("Apply a reviewed proposal after integrity and target-hash checks")
  .action(async (proposalFile, root, options) => {
    const appliedAt = options.appliedAt ? generatedAt(options.appliedAt) : new Date();
    const value = await applyKnowledgeProposal(root, await readProposal(proposalFile), options.confirm, appliedAt);
    await writeJson(proposalFile, value);
    const graph = await buildGraph(root);
    console.log(`Applied ${value.id}: ${value.changes.length} Markdown change(s)`);
    console.log(`${graph.stats.files} files · ${graph.stats.links} links · ${graph.diagnostics.length} diagnostic(s)`);
  });

program.command("canvas")
  .argument("[root]", "wiki root", ".")
  .option("-o, --output <file>", "JSON Canvas output", "Wiki.canvas")
  .option("--previous <file>", "existing canvas whose manual positions should be retained")
  .description("Generate an Obsidian-compatible JSON Canvas")
  .action(async (root, options) => {
    const graph = await buildGraph(root);
    const previous = await readCanvas(options.previous ?? options.output);
    const summary = summarizeCanvasLayout(graph, previous);
    printRemovedPages(summary);
    await writeJson(options.output, graphToCanvas(graph, previous));
    console.log(`Canvas ${graph.stats.files} nodes, ${graph.stats.links} edges → ${options.output}`);
    printLayoutSummary(summary);
  });

program.command("excalidraw")
  .argument("[root]", "wiki root", ".")
  .option("-o, --output <file>", "Excalidraw scene output", "Wiki.excalidraw")
  .option("--previous <file>", "existing scene whose positions and annotations should be retained")
  .description("Generate an editable Excalidraw relationship scene")
  .action(async (root, options) => {
    const graph = await buildGraph(root);
    const previous = await readExcalidraw(options.previous ?? options.output);
    const summary = summarizeExcalidrawLayout(graph, previous);
    printRemovedPages(summary);
    await writeJson(options.output, graphToExcalidraw(graph, { previous }));
    console.log(`Excalidraw ${graph.stats.files} nodes, ${graph.stats.links} edges → ${options.output}`);
    printLayoutSummary(summary);
  });

program.command("diagram")
  .argument("[root]", "wiki root", ".")
  .requiredOption("--focus <page>", "focus page title, ID, or relative Markdown path")
  .option("--depth <number>", "relationship depth: 1 or 2", "1")
  .option("--direction <direction>", "both, incoming, or outgoing", "both")
  .option("--kind <kind...>", "neighbor page kinds: index, concept, source, note")
  .option("--format <format>", "mermaid or excalidraw", "mermaid")
  .option("-o, --output <file>", "focused diagram output")
  .description("Export a focused page neighborhood to Mermaid or Excalidraw")
  .action(async (root, options) => {
    const depth = Number.parseInt(options.depth, 10);
    if (![1, 2].includes(depth) || String(depth) !== String(options.depth)) throw new Error(`Focused diagram depth must be 1 or 2: ${options.depth}`);
    if (!["both", "incoming", "outgoing"].includes(options.direction)) throw new Error(`Invalid focused diagram direction: ${options.direction}`);
    if (!["mermaid", "excalidraw"].includes(options.format)) throw new Error(`Invalid focused diagram format: ${options.format}`);
    const allowedKinds = new Set<NodeKind>(["index", "concept", "source", "note"]);
    const kinds = options.kind?.map((kind: string) => kind.toLocaleLowerCase()) as NodeKind[] | undefined;
    const invalidKinds = kinds?.filter((kind) => !allowedKinds.has(kind)) ?? [];
    if (invalidKinds.length) throw new Error(`Invalid focused diagram page kind: ${invalidKinds.join(", ")}`);
    const graph = await buildGraph(root);
    const focused = selectFocusedGraph(graph, options.focus, { depth: depth as 1 | 2, direction: options.direction, kinds });
    const output = options.output ?? focusedOutput(focused.focus.title, options.format);
    if (options.format === "mermaid") await writeText(output, graphToMermaid(focused.graph, focused.focus));
    else {
      const previous = await readExcalidraw(output);
      printRemovedPages(summarizeExcalidrawLayout(focused.graph, previous));
      await writeJson(output, graphToExcalidraw(focused.graph, { focusId: focused.focus.id, previous }));
      printLayoutSummary(summarizeExcalidrawLayout(focused.graph, previous));
    }
    console.log(`Focused ${focused.graph.stats.files} pages, ${focused.graph.stats.links} relationships around ${focused.focus.path} → ${output}`);
    if (focused.graph.stats.brokenLinks) console.log(`${focused.graph.stats.brokenLinks} broken link(s) originate from selected pages`);
  });

program.command("build")
  .argument("[root]", "wiki root", ".")
  .option("--graph <file>", "graph JSON output", ".lwc/graph.json")
  .option("--canvas <file>", "JSON Canvas output", "Wiki.canvas")
  .option("--excalidraw <file>", "optional Excalidraw scene output")
  .option("--generated-at <iso>", "fixed ISO timestamp for reproducible graph output")
  .description("Generate graph JSON, JSON Canvas, and optional Excalidraw scene")
  .action(async (root, options) => {
    const fixedTime = options.generatedAt ? generatedAt(options.generatedAt) : undefined;
    const graph = await buildGraph(root, fixedTime ?? new Date(), fixedTime);
    const previous = await readCanvas(options.canvas);
    const previousExcalidraw = await readExcalidraw(options.excalidraw);
    const canvasSummary = summarizeCanvasLayout(graph, previous);
    const excalidrawSummary = summarizeExcalidrawLayout(graph, previousExcalidraw);
    printRemovedPages(canvasSummary);
    if (options.excalidraw) printRemovedPages(excalidrawSummary);
    const writes = [
      writeJson(options.graph, graph),
      writeJson(options.canvas, graphToCanvas(graph, previous)),
    ];
    if (options.excalidraw) writes.push(writeJson(options.excalidraw, graphToExcalidraw(graph, { previous: previousExcalidraw })));
    await Promise.all(writes);
    console.log(`Built ${graph.stats.files} files · ${graph.stats.links} links · ${graph.stats.brokenLinks} broken`);
    console.log(`Graph → ${options.graph}`);
    console.log(`Canvas → ${options.canvas}`);
    printLayoutSummary(canvasSummary);
    if (options.excalidraw) {
      console.log(`Excalidraw → ${options.excalidraw}`);
      printLayoutSummary(excalidrawSummary);
    }
  });

program.command("serve")
  .argument("[root]", "wiki root", ".")
  .option("--host <address>", "listen address", "127.0.0.1")
  .option("-p, --port <port>", "listen port", "4173")
  .option("--no-watch", "disable automatic Markdown rebuilds")
  .description("Serve the local Workbench and rebuild when Markdown changes")
  .action(async (root, options) => {
    const port = Number.parseInt(options.port, 10);
    if (!Number.isInteger(port) || String(port) !== String(options.port) || port < 1 || port > 65535) {
      throw new Error(`Invalid --port value: ${options.port}`);
    }
    if (options.host !== "127.0.0.1" && options.host !== "::1" && options.host !== "localhost") {
      console.warn(`Warning: --host ${options.host} may expose private wiki metadata to the network`);
    }
    const server = await startWikiServer({ root, host: options.host, port, watch: options.watch });
    console.log(`LLM Wiki Canvas → ${server.url}`);
    console.log(options.watch ? `Watching ${path.resolve(root)} for Markdown changes` : "Markdown watch disabled");
    console.log("Press Ctrl+C to stop");
    await new Promise<void>((resolve, reject) => {
      const shutdown = () => { void server.close().then(resolve, reject); };
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
    });
  });

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
