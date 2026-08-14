import { cpSync, mkdirSync, rmSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const fixture = path.join(root, ".lwc", "e2e-live");
const vault = path.join(fixture, "vault");
const draft = path.join(fixture, "draft");
const proposal = path.join(vault, ".lwc", "proposals", "live-e2e.json");
const port = process.env.LWC_LIVE_E2E_PORT ?? "4175";

rmSync(fixture, { recursive: true, force: true });
mkdirSync(fixture, { recursive: true });
cpSync(path.join(root, "examples", "atlas-wiki"), vault, { recursive: true });
cpSync(path.join(root, "examples", "proposal-draft"), draft, { recursive: true });

const created = spawnSync(process.execPath, [
  "dist/index.js", "proposal", "create", vault,
  "--from", draft,
  "--summary", "Live browser review fixture",
  "--created-at", "2026-08-10T00:00:00.000Z",
  "--output", proposal,
], { cwd: root, encoding: "utf8" });
if (created.status !== 0) {
  process.stderr.write(`${created.stdout}\n${created.stderr}`);
  rmSync(fixture, { recursive: true, force: true });
  process.exit(created.status ?? 1);
}

const server = spawn(process.execPath, ["dist/index.js", "serve", vault, "--port", port, "--no-watch"], {
  cwd: root,
  stdio: "inherit",
});

let closing = false;
function close(signal) {
  if (closing) return;
  closing = true;
  server.kill(signal);
  rmSync(fixture, { recursive: true, force: true });
}
process.on("SIGINT", () => close("SIGINT"));
process.on("SIGTERM", () => close("SIGTERM"));
process.on("exit", () => rmSync(fixture, { recursive: true, force: true }));
server.on("exit", (code) => {
  rmSync(fixture, { recursive: true, force: true });
  process.exit(code ?? 0);
});
