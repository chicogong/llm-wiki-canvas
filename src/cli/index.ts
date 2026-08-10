#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Command } from "commander";
import { buildGraph, buildWikiReport, graphToCanvas, reportToMarkdown, type JsonCanvas } from "../core/index.js";

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

program.command("build")
  .argument("[root]", "wiki root", ".")
  .option("--graph <file>", "graph JSON output", ".lwc/graph.json")
  .option("--canvas <file>", "JSON Canvas output", "Wiki.canvas")
  .option("--generated-at <iso>", "fixed ISO timestamp for reproducible graph output")
  .description("Generate both graph JSON and JSON Canvas")
  .action(async (root, options) => {
    const fixedTime = options.generatedAt ? generatedAt(options.generatedAt) : undefined;
    const graph = await buildGraph(root, fixedTime ?? new Date(), fixedTime);
    const previous = await readCanvas(options.canvas);
    await Promise.all([
      writeJson(options.graph, graph),
      writeJson(options.canvas, graphToCanvas(graph, previous)),
    ]);
    console.log(`Built ${graph.stats.files} files · ${graph.stats.links} links · ${graph.stats.brokenLinks} broken`);
    console.log(`Graph → ${options.graph}`);
    console.log(`Canvas → ${options.canvas}`);
  });

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
