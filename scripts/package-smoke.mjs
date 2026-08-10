import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
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

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("could not reserve a package smoke port");
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function waitForJson(url, child, output) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`packaged server exited early\n${output()}`);
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // The process may still be binding the loopback port.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`packaged server did not become ready\n${output()}`);
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
  run(lwc, ["serve", "--help"], { cwd: consumer });
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
  run(lwc, ["report", wiki, "--format", "json", "--generated-at", "2026-08-10T00:00:00.000Z", "-o", path.join(consumer, "report.json")], { cwd: consumer });
  const markdownReport = run(lwc, ["report", wiki, "--top", "1"], { cwd: consumer }).stdout;
  run(lwc, ["report", wiki, "--format", "xml"], { cwd: consumer, expectFailure: true });
  run(lwc, ["report", wiki, "--top", "many"], { cwd: consumer, expectFailure: true });
  run(lwc, ["build", wiki, "--generated-at", "not-a-date"], { cwd: consumer, expectFailure: true });
  const graph = JSON.parse(readFileSync(path.join(consumer, "graph.json"), "utf8"));
  const canvas = JSON.parse(readFileSync(path.join(consumer, "Wiki.canvas"), "utf8"));
  const builtGraph = JSON.parse(readFileSync(path.join(consumer, "built-graph.json"), "utf8"));
  const report = JSON.parse(readFileSync(path.join(consumer, "report.json"), "utf8"));
  const nodeIds = new Set(canvas.nodes.map((node) => node.id));
  const edgeIds = new Set(canvas.edges.map((edge) => edge.id));
  const validEndpoints = canvas.edges.every((edge) => nodeIds.has(edge.fromNode) && nodeIds.has(edge.toNode));
  if (graph.stats.brokenLinks !== 1 || builtGraph.stats.brokenLinks !== 0 || canvas.nodes.length !== 3 || canvas.edges.length !== 2) {
    throw new Error("packaged CLI artifacts did not match the expected smoke fixture");
  }
  if (report.summary.pages !== 3 || report.summary.connectedPages !== 2 || report.summary.warnings !== 1 || !markdownReport.includes("Wiki health report")) {
    throw new Error("packaged CLI report did not match the expected smoke fixture");
  }
  if (canvas.nodes[0].x !== 4321 || canvas.nodes[0].y !== -1234 || nodeIds.size !== canvas.nodes.length || edgeIds.size !== canvas.edges.length || !validEndpoints) {
    throw new Error("canvas preservation or JSON Canvas integrity check failed");
  }
  const servePort = await freePort();
  const served = spawn(lwc, ["serve", wiki, "--port", String(servePort), "--no-watch"], { cwd: consumer, stdio: ["ignore", "pipe", "pipe"] });
  let serveOutput = "";
  served.stdout.on("data", (chunk) => { serveOutput += chunk; });
  served.stderr.on("data", (chunk) => { serveOutput += chunk; });
  try {
    const status = await waitForJson(`http://127.0.0.1:${servePort}/__lwc/status`, served, () => serveOutput);
    const viewer = await fetch(`http://127.0.0.1:${servePort}/`, { redirect: "follow" });
    if (!status.live || status.watching || !viewer.ok || !(await viewer.text()).includes("LLM Wiki Canvas")) {
      throw new Error(`packaged server did not expose the expected Workbench\n${serveOutput}`);
    }
  } finally {
    served.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => served.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  }
  const draft = path.join(consumer, "draft");
  const proposalFile = path.join(consumer, "proposal.json");
  mkdirSync(draft, { recursive: true });
  writeFileSync(path.join(draft, "Missing.md"), "# Missing\n[[index]]\n\nReviewed addition.\n");
  writeFileSync(path.join(draft, "Reviewed.md"), "# Reviewed\n[[index]]\n");
  run(lwc, ["proposal", "create", wiki, "--from", draft, "--summary", "Package proposal", "--created-at", "2026-08-10T00:00:00.000Z", "-o", proposalFile], { cwd: consumer });
  const proposed = JSON.parse(readFileSync(proposalFile, "utf8"));
  if (proposed.status !== "proposed" || proposed.changes.length !== 2) throw new Error("packaged CLI did not create the expected proposal");
  const shown = run(lwc, ["proposal", "show", proposalFile], { cwd: consumer }).stdout;
  if (!shown.includes("Reviewed addition") || !shown.includes("Base SHA-256")) throw new Error("packaged CLI proposal diff is incomplete");
  run(lwc, ["proposal", "apply", proposalFile, wiki, "--confirm", proposed.id], { cwd: consumer, expectFailure: true });
  run(lwc, ["proposal", "review", proposalFile, "--approve", proposed.id, "--reviewer", "Package Smoke", "--reviewed-at", "2026-08-10T01:00:00.000Z"], { cwd: consumer });
  run(lwc, ["proposal", "apply", proposalFile, wiki, "--confirm", proposed.id, "--applied-at", "2026-08-10T02:00:00.000Z"], { cwd: consumer });
  const applied = JSON.parse(readFileSync(proposalFile, "utf8"));
  if (applied.status !== "applied" || !readFileSync(path.join(wiki, "Reviewed.md"), "utf8").includes("# Reviewed")) {
    throw new Error("packaged CLI did not apply the reviewed proposal");
  }
  run(lwc, ["scan", path.join(scratch, "missing-root")], { cwd: consumer, expectFailure: true });
  console.log("Packaged CLI smoke passed: bin, scan, lint/strict, report, build, local serve, proposal lifecycle, canvas preservation, invalid root");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
