import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const project = process.cwd();
const scratch = mkdtempSync(path.join(tmpdir(), "lwc-package-smoke-"));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd ?? project, encoding: "utf8" });
  if (options.expectFailure) {
    if (result.status === 0) throw new Error(`${command} unexpectedly succeeded`);
    return result;
  }
  if (result.status !== 0) throw new Error(`${command} failed\n${result.stdout}\n${result.stderr}`);
  return result;
}

try {
  const packed = execFileSync("pnpm", ["pack", "--pack-destination", scratch], { cwd: project, encoding: "utf8" });
  const tarballName = packed.trim().split("\n").at(-1);
  if (!tarballName) throw new Error("pnpm pack did not return a tarball path");
  const tarball = path.resolve(project, tarballName);
  const consumer = path.join(scratch, "consumer");
  const wiki = path.join(consumer, "wiki");
  mkdirSync(wiki, { recursive: true });
  writeFileSync(path.join(consumer, "package.json"), '{"name":"lwc-package-smoke","private":true}\n');
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball], { cwd: consumer });
  const lwc = path.join(consumer, "node_modules", ".bin", "lwc");
  writeFileSync(path.join(wiki, "index.md"), "# Package Smoke\n[[Missing]]\n");
  run(lwc, ["--version"], { cwd: consumer });
  run(lwc, ["scan", wiki, "-o", path.join(consumer, "graph.json")], { cwd: consumer });
  run(lwc, ["lint", wiki], { cwd: consumer, expectFailure: true });
  writeFileSync(path.join(wiki, "Missing.md"), "# Missing\n[[index]]\n");
  run(lwc, ["lint", wiki], { cwd: consumer });
  writeFileSync(path.join(wiki, "Orphan.md"), "# Orphan\n");
  run(lwc, ["lint", wiki], { cwd: consumer });
  run(lwc, ["lint", wiki, "--strict"], { cwd: consumer, expectFailure: true });
  run(lwc, ["canvas", wiki, "-o", path.join(consumer, "Wiki.canvas")], { cwd: consumer });
  const editableCanvas = JSON.parse(readFileSync(path.join(consumer, "Wiki.canvas"), "utf8"));
  editableCanvas.nodes[0].x = 4321;
  editableCanvas.nodes[0].y = -1234;
  writeFileSync(path.join(consumer, "Wiki.canvas"), `${JSON.stringify(editableCanvas)}\n`);
  run(lwc, ["canvas", wiki, "-o", path.join(consumer, "Wiki.canvas")], { cwd: consumer });
  run(lwc, ["build", wiki, "--graph", path.join(consumer, "built-graph.json"), "--canvas", path.join(consumer, "Built.canvas")], { cwd: consumer });
  run(lwc, ["build", wiki, "--generated-at", "not-a-date"], { cwd: consumer, expectFailure: true });
  const graph = JSON.parse(readFileSync(path.join(consumer, "graph.json"), "utf8"));
  const canvas = JSON.parse(readFileSync(path.join(consumer, "Wiki.canvas"), "utf8"));
  const builtGraph = JSON.parse(readFileSync(path.join(consumer, "built-graph.json"), "utf8"));
  const nodeIds = new Set(canvas.nodes.map((node) => node.id));
  const edgeIds = new Set(canvas.edges.map((edge) => edge.id));
  const validEndpoints = canvas.edges.every((edge) => nodeIds.has(edge.fromNode) && nodeIds.has(edge.toNode));
  if (graph.stats.brokenLinks !== 1 || builtGraph.stats.brokenLinks !== 0 || canvas.nodes.length !== 3 || canvas.edges.length !== 2) {
    throw new Error("packaged CLI artifacts did not match the expected smoke fixture");
  }
  if (canvas.nodes[0].x !== 4321 || canvas.nodes[0].y !== -1234 || nodeIds.size !== canvas.nodes.length || edgeIds.size !== canvas.edges.length || !validEndpoints) {
    throw new Error("canvas preservation or JSON Canvas integrity check failed");
  }
  run(lwc, ["scan", path.join(scratch, "missing-root")], { cwd: consumer, expectFailure: true });
  console.log("Packaged CLI smoke passed: bin, scan, lint/strict, build, canvas preservation, invalid root");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
