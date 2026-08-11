import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
  run(lwc, ["excalidraw", wiki, "-o", path.join(consumer, "Wiki.excalidraw")], { cwd: consumer });
  run(lwc, ["diagram", wiki, "--focus", "Missing", "--depth", "1", "--format", "mermaid", "-o", path.join(consumer, "Focused.mmd")], { cwd: consumer });
  run(lwc, ["diagram", wiki, "--focus", "Missing", "--depth", "1", "--format", "excalidraw", "-o", path.join(consumer, "Focused.excalidraw")], { cwd: consumer });
  run(lwc, ["diagram", wiki, "--focus", "Missing", "--depth", "3"], { cwd: consumer, expectFailure: true });
  run(lwc, ["diagram", wiki, "--focus", "Missing", "--kind", "unknown"], { cwd: consumer, expectFailure: true });
  const editableCanvas = JSON.parse(readFileSync(path.join(consumer, "Wiki.canvas"), "utf8"));
  editableCanvas.nodes[0].x = 4321;
  editableCanvas.nodes[0].y = -1234;
  writeFileSync(path.join(consumer, "Wiki.canvas"), `${JSON.stringify(editableCanvas)}\n`);
  run(lwc, ["canvas", wiki, "-o", path.join(consumer, "Wiki.canvas")], { cwd: consumer });
  run(lwc, ["build", wiki, "--graph", path.join(consumer, "built-graph.json"), "--canvas", path.join(consumer, "Built.canvas"), "--excalidraw", path.join(consumer, "Built.excalidraw")], { cwd: consumer });
  run(lwc, ["report", wiki, "--format", "json", "--generated-at", "2026-08-10T00:00:00.000Z", "-o", path.join(consumer, "report.json")], { cwd: consumer });
  const markdownReport = run(lwc, ["report", wiki, "--top", "1"], { cwd: consumer }).stdout;
  run(lwc, ["report", wiki, "--format", "xml"], { cwd: consumer, expectFailure: true });
  run(lwc, ["report", wiki, "--top", "many"], { cwd: consumer, expectFailure: true });
  run(lwc, ["build", wiki, "--generated-at", "not-a-date"], { cwd: consumer, expectFailure: true });
  const graph = JSON.parse(readFileSync(path.join(consumer, "graph.json"), "utf8"));
  const canvas = JSON.parse(readFileSync(path.join(consumer, "Wiki.canvas"), "utf8"));
  const excalidraw = JSON.parse(readFileSync(path.join(consumer, "Wiki.excalidraw"), "utf8"));
  const builtExcalidraw = JSON.parse(readFileSync(path.join(consumer, "Built.excalidraw"), "utf8"));
  const focusedMermaid = readFileSync(path.join(consumer, "Focused.mmd"), "utf8");
  const focusedExcalidraw = JSON.parse(readFileSync(path.join(consumer, "Focused.excalidraw"), "utf8"));
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
  if (excalidraw.type !== "excalidraw" || excalidraw.version !== 2 || excalidraw.elements.filter((element) => element.type === "rectangle").length !== 3 || builtExcalidraw.elements.length !== excalidraw.elements.length || JSON.stringify(excalidraw).includes(wiki)) {
    throw new Error("Excalidraw scene integrity or path portability check failed");
  }
  if (!focusedMermaid.includes("%% Focus: Missing.md") || !focusedMermaid.includes("flowchart LR") || focusedExcalidraw.elements.filter((element) => element.type === "rectangle").length !== 2 || focusedExcalidraw.elements.filter((element) => element.type === "arrow").length !== 2) {
    throw new Error("focused Mermaid and Excalidraw exports did not use the same neighborhood");
  }
  const draft = path.join(consumer, "draft");
  const proposalFile = path.join(wiki, ".lwc", "proposals", "package.json");
  mkdirSync(draft, { recursive: true });
  writeFileSync(path.join(draft, "Missing.md"), "# Missing\n[[index]]\n\nReviewed addition.\n");
  writeFileSync(path.join(draft, "Reviewed.md"), "# Reviewed\n[[index]]\n");
  run(lwc, ["proposal", "create", wiki, "--from", draft, "--summary", "Package proposal", "--created-at", "2026-08-10T00:00:00.000Z", "-o", proposalFile], { cwd: consumer });
  const proposed = JSON.parse(readFileSync(proposalFile, "utf8"));
  if (proposed.status !== "proposed" || proposed.changes.length !== 2) throw new Error("packaged CLI did not create the expected proposal");
  const servePort = await freePort();
  const served = spawn(lwc, ["serve", wiki, "--port", String(servePort), "--no-watch"], { cwd: consumer, stdio: ["ignore", "pipe", "pipe"] });
  let serveOutput = "";
  served.stdout.on("data", (chunk) => { serveOutput += chunk; });
  served.stderr.on("data", (chunk) => { serveOutput += chunk; });
  try {
    const status = await waitForJson(`http://127.0.0.1:${servePort}/__lwc/status`, served, () => serveOutput);
    const inbox = await fetch(`http://127.0.0.1:${servePort}/__lwc/proposals`).then((response) => response.json());
    const viewer = await fetch(`http://127.0.0.1:${servePort}/`, { redirect: "follow" });
    if (!status.live || status.watching || status.proposals !== 1 || inbox.proposals[0]?.id !== proposed.id || !viewer.ok || !(await viewer.text()).includes("LLM Wiki Canvas")) {
      throw new Error(`packaged server did not expose the expected Workbench inbox\n${serveOutput}`);
    }
  } finally {
    served.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => served.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  }
  const shown = run(lwc, ["proposal", "show", proposalFile], { cwd: consumer }).stdout;
  if (!shown.includes("Reviewed addition") || !shown.includes("Base SHA-256")) throw new Error("packaged CLI proposal diff is incomplete");
  run(lwc, ["proposal", "apply", proposalFile, wiki, "--confirm", proposed.id], { cwd: consumer, expectFailure: true });
  run(lwc, ["proposal", "review", proposalFile, "--approve", proposed.id, "--reviewer", "Package Smoke", "--reviewed-at", "2026-08-10T01:00:00.000Z"], { cwd: consumer });
  run(lwc, ["proposal", "apply", proposalFile, wiki, "--confirm", proposed.id, "--applied-at", "2026-08-10T02:00:00.000Z"], { cwd: consumer });
  const applied = JSON.parse(readFileSync(proposalFile, "utf8"));
  if (applied.status !== "applied" || !readFileSync(path.join(wiki, "Reviewed.md"), "utf8").includes("# Reviewed")) {
    throw new Error("packaged CLI did not apply the reviewed proposal");
  }
  const intakeSource = path.join(consumer, "intake-source.txt");
  writeFileSync(intakeSource, "Source-grounded package knowledge.\n");
  run(lwc, ["intake", "create", wiki, "--source", intakeSource, "--target", "Intake.md", "--generator", "Package Smoke", "--created-at", "2026-08-10T03:00:00.000Z"], { cwd: consumer });
  const intakeIds = readdirSync(path.join(wiki, ".lwc", "drafts"));
  if (intakeIds.length !== 1) throw new Error("packaged CLI did not create exactly one intake draft");
  const intakeManifest = path.join(wiki, ".lwc", "drafts", intakeIds[0], "intake.json");
  const intakeDraft = path.join(wiki, ".lwc", "drafts", intakeIds[0], "Intake.md");
  const intakeShown = run(lwc, ["intake", "show", intakeManifest], { cwd: consumer }).stdout;
  if (!intakeShown.includes("Source SHA-256") || !intakeShown.includes("Draft target: `Intake.md`")) throw new Error("packaged CLI intake evidence is incomplete");
  writeFileSync(intakeDraft, "# Intake\n\nSource-grounded package knowledge. [[index]]\n");
  run(lwc, ["intake", "propose", intakeManifest, wiki, "--summary", "Package intake", "--proposed-at", "2026-08-10T04:00:00.000Z"], { cwd: consumer });
  const intake = JSON.parse(readFileSync(intakeManifest, "utf8"));
  const intakeProposalFile = path.join(wiki, intake.proposal.file);
  const intakeProposal = JSON.parse(readFileSync(intakeProposalFile, "utf8"));
  if (intake.status !== "proposed" || intakeProposal.changes[0]?.path !== "Intake.md" || intakeProposal.intake?.sourceHash !== intake.source.sha256 || intakeProposal.intake?.generator !== "Package Smoke") throw new Error("packaged CLI intake did not create the expected source-bound proposal");
  run(lwc, ["proposal", "review", intakeProposalFile, "--approve", intakeProposal.id, "--reviewer", "Package Smoke", "--reviewed-at", "2026-08-10T05:00:00.000Z"], { cwd: consumer });
  run(lwc, ["proposal", "apply", intakeProposalFile, wiki, "--confirm", intakeProposal.id, "--applied-at", "2026-08-10T06:00:00.000Z"], { cwd: consumer });
  if (!readFileSync(path.join(wiki, "Intake.md"), "utf8").includes("Source-grounded")) throw new Error("packaged CLI intake proposal did not pass the human review gate");
  run(lwc, ["scan", path.join(scratch, "missing-root")], { cwd: consumer, expectFailure: true });
  console.log("Packaged CLI smoke passed: bin, scan, lint/strict, report, build, local serve, intake and proposal lifecycles, focused Mermaid/Excalidraw exports, invalid root");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
