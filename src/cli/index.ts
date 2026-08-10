#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Command } from "commander";
import {
  applyKnowledgeProposal,
  buildGraph,
  buildWikiReport,
  createKnowledgeProposal,
  graphToCanvas,
  graphToExcalidraw,
  parseKnowledgeProposal,
  proposalToMarkdown,
  rejectKnowledgeProposal,
  reportToMarkdown,
  reviewKnowledgeProposal,
  type JsonCanvas,
  type KnowledgeProposal,
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

async function readProposal(target: string): Promise<KnowledgeProposal> {
  try {
    return parseKnowledgeProposal(JSON.parse(await readFile(path.resolve(target), "utf8")));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`Proposal is not valid JSON: ${target}`);
    throw error;
  }
}

function generatedAt(value?: string): Date {
  if (!value) return new Date();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid --generated-at value: ${value}`);
  return date;
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
    await writeJson(options.output, graphToCanvas(graph, previous));
    console.log(`Canvas ${graph.stats.files} nodes, ${graph.stats.links} edges → ${options.output}`);
  });

program.command("excalidraw")
  .argument("[root]", "wiki root", ".")
  .option("-o, --output <file>", "Excalidraw scene output", "Wiki.excalidraw")
  .description("Generate an editable Excalidraw relationship scene")
  .action(async (root, options) => {
    const graph = await buildGraph(root);
    await writeJson(options.output, graphToExcalidraw(graph));
    console.log(`Excalidraw ${graph.stats.files} nodes, ${graph.stats.links} edges → ${options.output}`);
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
    const writes = [
      writeJson(options.graph, graph),
      writeJson(options.canvas, graphToCanvas(graph, previous)),
    ];
    if (options.excalidraw) writes.push(writeJson(options.excalidraw, graphToExcalidraw(graph)));
    await Promise.all(writes);
    console.log(`Built ${graph.stats.files} files · ${graph.stats.links} links · ${graph.stats.brokenLinks} broken`);
    console.log(`Graph → ${options.graph}`);
    console.log(`Canvas → ${options.canvas}`);
    if (options.excalidraw) console.log(`Excalidraw → ${options.excalidraw}`);
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
