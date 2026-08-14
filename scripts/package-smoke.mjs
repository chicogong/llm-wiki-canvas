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
  const okfWiki = path.join(consumer, "okf-wiki");
  mkdirSync(wiki, { recursive: true });
  mkdirSync(okfWiki, { recursive: true });
  writeFileSync(path.join(consumer, "package.json"), '{"name":"lwc-package-smoke","private":true}\n');
  run("npm", ["install", "--no-audit", "--no-fund", tarball], { cwd: consumer });
  const installedPackage = path.join(consumer, "node_modules", "llm-wiki-canvas");
  const installedManifest = JSON.parse(readFileSync(path.join(installedPackage, "package.json"), "utf8"));
  if (installedManifest.version !== "0.1.0") throw new Error(`packed release-candidate version drifted: ${installedManifest.version}`);
  const thirdPartyNotices = readFileSync(path.join(installedPackage, "THIRD_PARTY_LICENSES.txt"), "utf8");
  if (!thirdPartyNotices.includes("commander@") || !thirdPartyNotices.includes("cytoscape@") || !thirdPartyNotices.includes("yaml@") || !thirdPartyNotices.includes("License:")) {
    throw new Error("packed npm artifact is missing complete third-party license notices");
  }
  const lwc = path.join(consumer, "node_modules", ".bin", "lwc");
  const longBin = path.join(consumer, "node_modules", ".bin", "llm-wiki-canvas");
  const help = run(lwc, ["--help"], { cwd: consumer }).stdout;
  if (!help.startsWith("Usage: lwc") || !help.includes("Also installed as: llm-wiki-canvas")) {
    throw new Error("packaged CLI help does not present the short command clearly");
  }
  for (const binary of [lwc, longBin]) {
    const version = run(binary, ["--version"], { cwd: consumer }).stdout.trim();
    if (version !== installedManifest.version) throw new Error(`packaged CLI version drifted: ${version}`);
  }
  writeFileSync(path.join(wiki, "index.md"), "# Package Smoke\n[[Missing]]\n");
  writeFileSync(path.join(okfWiki, "index.md"), "---\nokf_version: '0.2'\n---\n# OKF Package Smoke\n[Metric](/metric.md)\n");
  writeFileSync(path.join(okfWiki, "metric.md"), "---\ntype: Metric\ntitle: Metric\ndescription: A package-level OKF trust fixture.\ngenerated: { by: process:package-smoke, at: 2026-08-12T00:00:00Z }\nverified: { by: human:package-reviewer, at: 2026-08-12T01:00:00Z }\nstatus: stable\nstale_after: 2026-12-31\nsources:\n  - { resource: https://example.invalid/policy, id: policy }\n---\n# Metric\nPackage evidence.\n");
  const agentWorkspace = path.join(consumer, "agent-workspace");
  mkdirSync(agentWorkspace, { recursive: true });
  const agentPreviewFile = path.join(consumer, "agents-preview.json");
  run(lwc, ["init", agentWorkspace, "--format", "json", "-o", agentPreviewFile], { cwd: consumer });
  const agentPreview = JSON.parse(readFileSync(agentPreviewFile, "utf8"));
  if (agentPreview.mode !== "dry-run" || agentPreview.summary.create !== 7 || agentPreview.summary.manual !== 1 || readdirSync(agentWorkspace).length !== 0) {
    throw new Error("packaged CLI Agent setup preview wrote files or returned the wrong plan");
  }
  const agentSetupFile = path.join(consumer, "agents-setup.json");
  run(lwc, ["init", agentWorkspace, "--write", "--format", "json", "-o", agentSetupFile], { cwd: consumer });
  const agentSetup = JSON.parse(readFileSync(agentSetupFile, "utf8"));
  if (agentSetup.mode !== "written" || agentSetup.summary.create !== 7 || !readFileSync(path.join(agentWorkspace, "AGENTS.md"), "utf8").includes("human direction")) {
    throw new Error("packaged CLI Agent setup did not create the safe shared contract");
  }
  const agentReportFile = path.join(consumer, "agents.json");
  run(lwc, ["agents", agentWorkspace, "--strict", "--format", "json", "-o", agentReportFile], { cwd: consumer });
  const agentReport = JSON.parse(readFileSync(agentReportFile, "utf8"));
  if (agentReport.summary.ready !== 5 || agentReport.summary.manual !== 1 || agentReport.summary.incomplete !== 0 || JSON.stringify(agentReport).includes(agentWorkspace)) {
    throw new Error("packaged CLI Agent compatibility report is incomplete or leaks an absolute workspace path");
  }
  writeFileSync(path.join(agentWorkspace, ".qoder", "skills", "llm-wiki-canvas", "SKILL.md"), "Stale copied workflow.\n");
  run(lwc, ["init", agentWorkspace, "--write"], { cwd: consumer, expectFailure: true });
  run(lwc, ["agents", agentWorkspace, "--strict"], { cwd: consumer, expectFailure: true });
  run(lwc, ["agents", agentWorkspace, "--format", "xml"], { cwd: consumer, expectFailure: true });
  run(lwc, ["serve", "--help"], { cwd: consumer });
  const okfReportFile = path.join(consumer, "okf-report.json");
  run(lwc, ["okf", "check", okfWiki, "--strict", "--format", "json", "-o", okfReportFile], { cwd: consumer });
  run(lwc, ["okf", "check", okfWiki, "--format", "xml"], { cwd: consumer, expectFailure: true });
  const okfReport = JSON.parse(readFileSync(okfReportFile, "utf8"));
  if (!okfReport.conformant || okfReport.declaredVersion !== "0.2" || JSON.stringify(okfReport).includes(okfWiki)) throw new Error("packaged CLI OKF check failed or leaked an absolute bundle path");
  run(lwc, ["scan", wiki, "-o", path.join(consumer, "graph.json")], { cwd: consumer });
  run(lwc, ["lint", wiki], { cwd: consumer, expectFailure: true });
  writeFileSync(path.join(wiki, "Missing.md"), "# Missing\n[[index]]\n");
  run(lwc, ["lint", wiki], { cwd: consumer });
  writeFileSync(path.join(wiki, "Orphan.md"), "# Orphan\n");
  run(lwc, ["lint", wiki], { cwd: consumer });
  run(lwc, ["lint", wiki, "--strict"], { cwd: consumer, expectFailure: true });
  const contextFile = path.join(consumer, "context.json");
  run(lwc, ["context", wiki, "--focus", "Missing", "--depth", "1", "--max-pages", "2", "--max-words", "20", "--format", "json", "-o", contextFile], { cwd: consumer });
  run(lwc, ["context", wiki, "--focus", "Missing", "--depth", "3"], { cwd: consumer, expectFailure: true });
  run(lwc, ["context", wiki, "--focus", "Missing", "--max-pages", "0"], { cwd: consumer, expectFailure: true });
  run(lwc, ["context", wiki, "--focus", "Absent"], { cwd: consumer, expectFailure: true });
  run(lwc, ["context", wiki, "--focus", "Missing", "--format", "xml"], { cwd: consumer, expectFailure: true });
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
  const context = JSON.parse(readFileSync(contextFile, "utf8"));
  const nodeIds = new Set(canvas.nodes.map((node) => node.id));
  const edgeIds = new Set(canvas.edges.map((edge) => edge.id));
  const validEndpoints = canvas.edges.every((edge) => nodeIds.has(edge.fromNode) && nodeIds.has(edge.toNode));
  if (graph.stats.brokenLinks !== 1 || builtGraph.stats.brokenLinks !== 0 || canvas.nodes.length !== 3 || canvas.edges.length !== 2) {
    throw new Error("packaged CLI artifacts did not match the expected smoke fixture");
  }
  if (report.summary.pages !== 3 || report.summary.connectedPages !== 2 || report.summary.warnings !== 1 || !markdownReport.includes("Wiki health report")) {
    throw new Error("packaged CLI report did not match the expected smoke fixture");
  }
  if (context.focus.path !== "Missing.md" || context.summary.selectedPages !== 2 || context.summary.includedWords > 20 || context.pages.some((page) => path.isAbsolute(page.path)) || JSON.stringify(context).includes(wiki)) {
    throw new Error("packaged CLI context bundle did not enforce its portable evidence budget");
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
  console.log("Packaged CLI smoke passed: bin, safe Agent setup, Agent compatibility, OKF v0.2 trust check, scan, lint/strict, bounded context, report, build, local serve, intake and proposal lifecycles, focused Mermaid/Excalidraw exports, invalid root");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
