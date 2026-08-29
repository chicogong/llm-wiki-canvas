import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const checker = path.join(projectRoot, "scripts", "check-adoption-readiness.mjs");

async function runChecker(ledger: string, today: string) {
  const scratch = await mkdtemp(path.join(tmpdir(), "lwc-adoption-check-"));
  const ledgerPath = path.join(scratch, "adoption-ledger.csv");
  await writeFile(ledgerPath, ledger);
  try {
    return spawnSync(process.execPath, [checker], {
      cwd: projectRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        LWC_ADOPTION_LEDGER: ledgerPath,
        LWC_ADOPTION_TODAY: today,
      },
    });
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

async function trackedLedger() {
  return readFile(path.join(projectRoot, "docs", "adoption-ledger.csv"), "utf8");
}

describe("D+7 adoption readiness gate", () => {
  it("accepts the tracked D+7 technical host pass", async () => {
    const result = await runChecker(await trackedLedger(), "2026-08-29");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("1 technical host pass(es)");
  });

  it("allows a D0-only ledger before the target date", async () => {
    const ledger = (await trackedLedger()).split("\n").filter((line) => !line.includes(",D+7,")).join("\n");
    const result = await runChecker(ledger, "2026-08-28");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("0 technical host pass(es)");
  });

  it("rejects a missing D+7 technical host pass on the target date", async () => {
    const ledger = (await trackedLedger()).split("\n").filter((line) => !line.includes(",D+7,")).join("\n");
    const result = await runChecker(ledger, "2026-08-29");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("requires at least one D+7 technical host pass");
  });

  it("rejects a D+7 row downgraded from host-runtime to compatibility evidence", async () => {
    const ledger = (await trackedLedger()).replace(",D+7,Codex,codex-cli 0.147.0,host-runtime,passed,", ",D+7,Codex,codex-cli 0.147.0,compatibility-fixture,pending-real-host,");
    const result = await runChecker(ledger, "2026-08-29");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("requires at least one D+7 technical host pass");
  });
});
