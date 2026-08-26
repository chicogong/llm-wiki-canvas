import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const project = process.cwd();
const fixtureRoot = path.join(project, "examples", "host-fixture");
const lwcEntry = path.join(project, "dist", "index.js");
const args = process.argv.slice(2);
const fixtureFiles = ["source/decision.txt", "task.md", "vault/index.md"];
const startedAt = Date.now();

function option(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

const requestedHost = option("--host", "fixture");
const outputFile = option("--output");
const keep = args.includes("--keep");
const supportedHosts = new Set(["fixture", "workbuddy-compat", "codex", "claude-code"]);
if (!supportedHosts.has(requestedHost)) throw new Error(`Unsupported runtime fixture host: ${requestedHost}`);
if (!["fixture", "workbuddy-compat"].includes(requestedHost) && process.env.LWC_RUN_HOST_FIXTURE !== "1") {
  throw new Error("Live host execution is opt-in. Set LWC_RUN_HOST_FIXTURE=1 after reviewing the synthetic fixture and account usage.");
}
if (!existsSync(lwcEntry)) throw new Error("Build the package first with pnpm build");

function run(command, commandArgs, cwd, timeout = 240_000) {
  const result = spawnSync(command, commandArgs, { cwd, encoding: "utf8", timeout, maxBuffer: 8 * 1024 * 1024 });
  if (result.error) {
    result.error.command = command;
    throw result.error;
  }
  if (result.status !== 0) {
    const error = new Error(`${command} exited ${result.status}`);
    error.command = command;
    error.status = result.status;
    error.output = `${result.stdout}\n${result.stderr}`;
    throw error;
  }
  return result;
}

function commandVersion(command) {
  const result = spawnSync(command, ["--version"], { encoding: "utf8", timeout: 10_000 });
  if (result.status !== 0) throw new Error(`${command} is unavailable`);
  return `${result.stdout || result.stderr}`.trim().split("\n")[0];
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fixtureHash() {
  const manifest = `${fixtureFiles.map((file) => `${sha256(readFileSync(path.join(fixtureRoot, ...file.split("/"))))}  ${file}`).join("\n")}\n`;
  return sha256(manifest);
}

function recordedFixtureHash() {
  const match = readFileSync(path.join(fixtureRoot, "fixture.sha256"), "utf8").match(/^aggregate\s+([a-f0-9]{64})$/m);
  if (!match) throw new Error("Fixture hash manifest is missing its aggregate SHA-256");
  return match[1];
}

const currentFixtureHash = fixtureHash();
if (currentFixtureHash !== recordedFixtureHash()) {
  throw new Error(`Fixture hash changed: expected ${recordedFixtureHash()}, received ${currentFixtureHash}`);
}

function fixtureDriver(workspace, hostName) {
  run(process.execPath, [lwcEntry, "intake", "create", "vault", "--source", "source/decision.txt", "--target", "concepts/Review Boundary.md", "--generator", hostName, "--created-at", "2026-08-22T00:00:00.000Z"], workspace);
  const intakeId = readdirSync(path.join(workspace, "vault", ".lwc", "drafts"))[0];
  const manifest = path.join(workspace, "vault", ".lwc", "drafts", intakeId, "intake.json");
  const draft = path.join(workspace, "vault", ".lwc", "drafts", intakeId, "concepts", "Review Boundary.md");
  const intake = JSON.parse(readFileSync(manifest, "utf8"));
  mkdirSync(path.dirname(draft), { recursive: true });
  writeFileSync(draft, `---\ntitle: "Review Boundary"\ntype: concept\nsource: intake:${intakeId}\nsource_sha256: ${intake.source.sha256}\ntags: [agent, governance]\nsummary: Agent knowledge remains proposed until a person reviews it.\n---\n\n# Review Boundary\n\nMarkdown remains the source of truth for the local knowledge workspace. Agent-generated knowledge must enter a Proposal and cannot be applied before human review. See [[../index]].\n`);
  run(process.execPath, [lwcEntry, "intake", "show", manifest], workspace);
  run(process.execPath, [lwcEntry, "intake", "propose", manifest, "vault", "--summary", "Record the shared review boundary", "--proposed-at", "2026-08-22T00:01:00.000Z"], workspace);
}

function hostPrompt(hostName) {
  return readFileSync(path.join(fixtureRoot, "task.md"), "utf8")
    .replaceAll("{{LWC_ENTRY}}", lwcEntry)
    .replaceAll("{{HOST_NAME}}", hostName);
}

function formalSnapshot(workspace) {
  const vault = path.join(workspace, "vault");
  const files = readdirSync(vault, { recursive: true })
    .map(String)
    .map((file) => file.split(path.sep).join("/"))
    .filter((file) => file.endsWith(".md") && !file.startsWith(".lwc/"))
    .sort();
  return Object.fromEntries(files.map((file) => [
    file,
    createHash("sha256").update(readFileSync(path.join(vault, ...file.split("/")))).digest("hex"),
  ]));
}

function didFormalMarkdownChange(workspace, baseline) {
  return JSON.stringify(formalSnapshot(workspace)) !== JSON.stringify(baseline);
}

function runHost(workspace, host) {
  if (host === "fixture") {
    fixtureDriver(workspace, "Reference Fixture");
    return { version: "deterministic-reference", output: "" };
  }
  if (host === "workbuddy-compat") {
    fixtureDriver(workspace, "Tencent WorkBuddy (compatibility fixture)");
    return { version: "local-compatibility-fixture", output: "" };
  }
  const prompt = hostPrompt(host === "codex" ? "Codex" : "Claude Code");
  if (host === "codex") {
    const finalMessage = path.join(workspace, ".lwc-host-final.txt");
    const result = run("codex", ["exec", "--ephemeral", "--ignore-user-config", "--skip-git-repo-check", "--sandbox", "workspace-write", "-c", "approval_policy=\"never\"", "--cd", workspace, "--output-last-message", finalMessage, prompt], workspace);
    return { version: commandVersion("codex"), output: existsSync(finalMessage) ? readFileSync(finalMessage, "utf8") : result.stdout };
  }
  const result = run("claude", ["--print", "--no-session-persistence", "--permission-mode", "acceptEdits", "--allowedTools", "Read,Write,Edit,Bash", "--disallowedTools", "WebSearch,WebFetch", "--max-budget-usd", "1.00", "--setting-sources", "project", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--no-chrome", prompt], workspace);
  return { version: commandVersion("claude"), output: result.stdout };
}

function validate(workspace, host, version, baseline) {
  const vault = path.join(workspace, "vault");
  const source = readFileSync(path.join(workspace, "source", "decision.txt"));
  const sourceHash = createHash("sha256").update(source).digest("hex");
  if (didFormalMarkdownChange(workspace, baseline)) throw new Error("Formal Vault changed before review");
  const draftIds = readdirSync(path.join(vault, ".lwc", "drafts"));
  if (draftIds.length !== 1) throw new Error(`Expected one intake, found ${draftIds.length}`);
  const manifest = JSON.parse(readFileSync(path.join(vault, ".lwc", "drafts", draftIds[0], "intake.json"), "utf8"));
  if (manifest.status !== "proposed" || manifest.source.sha256 !== sourceHash || manifest.draft.path !== "concepts/Review Boundary.md") throw new Error("Intake provenance or lifecycle mismatch");
  const expectedGenerator = host === "fixture"
    ? "Reference Fixture"
    : host === "workbuddy-compat"
      ? "Tencent WorkBuddy (compatibility fixture)"
      : host === "codex"
        ? "Codex"
        : "Claude Code";
  if (manifest.generator !== expectedGenerator) throw new Error(`Generator mismatch: ${manifest.generator}`);
  const proposalPath = path.join(vault, ...manifest.proposal.file.split("/"));
  const proposal = JSON.parse(readFileSync(proposalPath, "utf8"));
  if (proposal.status !== "proposed" || proposal.review || proposal.rejection || proposal.application || proposal.changes.length !== 1) throw new Error("Host crossed the human review boundary");
  const change = proposal.changes[0];
  if (change.path !== "concepts/Review Boundary.md" || !/Markdown remains the source of truth/i.test(change.content) || !/human review/i.test(change.content) || !change.content.includes("[[../index]]")) {
    throw new Error("Proposed Markdown does not preserve the fixture evidence semantics");
  }
  if (proposal.intake?.sourceHash !== sourceHash || proposal.intake?.generator !== expectedGenerator) throw new Error("Proposal lost intake provenance");
  const contextFile = path.join(workspace, ".lwc-adoption-context.json");
  const context = JSON.parse(readFileSync(contextFile, "utf8"));
  if (context.focus?.path !== "index.md" || context.summary?.selectedPages !== 1 || context.pages?.[0]?.contentSha256 !== baseline["index.md"]) {
    throw new Error("Bounded context did not preserve the fixture page hash");
  }
  run(process.execPath, [lwcEntry, "proposal", "show", proposalPath, "--format", "json"], workspace);
  const blockedApply = spawnSync(process.execPath, [lwcEntry, "proposal", "apply", proposalPath, "vault", "--confirm", proposal.id], {
    cwd: workspace,
    encoding: "utf8",
    timeout: 30_000,
  });
  const blockedOutput = `${blockedApply.stdout}\n${blockedApply.stderr}`;
  if (blockedApply.status === 0 || !/Only reviewed knowledge can be applied/.test(blockedOutput)) {
    throw new Error("Unreviewed apply did not fail closed");
  }
  const compatibilityOnly = host === "workbuddy-compat";
  return {
    schemaVersion: 1,
    host,
    version,
    status: compatibilityOnly ? "pending" : "passed",
    fixture: "examples/host-fixture",
    fixtureSha256: currentFixtureHash,
    evidenceKind: compatibilityOnly ? "compatibility-fixture" : host === "fixture" ? "deterministic-reference" : "host-runtime",
    ...(compatibilityOnly ? { reason: "real-workbuddy-host-required", localCompatibility: "passed" } : {}),
    formalMarkdownChanged: false,
    proposalStatus: proposal.status,
    target: change.path,
    sourceHash,
    contextHash: context.pages[0].contentSha256,
    contentHash: change.contentHash,
    applyWithoutReview: "blocked",
    generator: expectedGenerator,
  };
}

function failureReport(host, version, error, formalMarkdownChanged) {
  const output = `${error?.output ?? error?.message ?? error}`;
  const authentication = /(?:401|authenticat|access token|login)/i.test(output);
  const unavailable = error?.code === "ENOENT";
  return {
    schemaVersion: 1,
    host,
    version,
    status: authentication ? "blocked" : unavailable ? "unavailable" : "failed",
    fixture: "examples/host-fixture",
    evidenceKind: "host-attempt",
    reason: authentication ? "authentication-unavailable" : unavailable ? "host-command-unavailable" : "host-command-failed",
    formalMarkdownChanged,
  };
}

function emit(report) {
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (outputFile) {
    mkdirSync(path.dirname(path.resolve(outputFile)), { recursive: true });
    writeFileSync(path.resolve(outputFile), json);
  }
  process.stdout.write(json);
}

const scratch = realpathSync(mkdtempSync(path.join(tmpdir(), `lwc-host-${requestedHost}-`)));
try {
  cpSync(fixtureRoot, scratch, { recursive: true });
  run(process.execPath, [lwcEntry, "init", scratch, "--write"], scratch);
  const baseline = formalSnapshot(scratch);
  run(process.execPath, [lwcEntry, "context", "vault", "--focus", "Host Fixture", "--depth", "0", "--max-pages", "1", "--max-words", "120", "--format", "json", "-o", path.join(scratch, ".lwc-adoption-context.json")], scratch);
  try {
    const runtime = runHost(scratch, requestedHost);
    emit({ ...validate(scratch, requestedHost, runtime.version, baseline), elapsedMs: Date.now() - startedAt });
  } catch (error) {
    const command = requestedHost === "claude-code" ? "claude" : requestedHost;
    const version = requestedHost === "fixture"
      ? "deterministic-reference"
      : requestedHost === "workbuddy-compat"
        ? "local-compatibility-fixture"
        : (() => { try { return commandVersion(command); } catch { return "unavailable"; } })();
    emit({ ...failureReport(requestedHost, version, error, didFormalMarkdownChange(scratch, baseline)), elapsedMs: Date.now() - startedAt });
    process.exitCode = 2;
  }
} finally {
  if (keep) process.stderr.write(`Fixture retained at ${scratch}\n`);
  else rmSync(scratch, { recursive: true, force: true });
}
