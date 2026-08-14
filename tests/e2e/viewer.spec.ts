import { expect, test, type Page } from "@playwright/test";

async function openWorkbench(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("map-view")).toBeVisible();
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  return errors;
}

async function openChangesFixture(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    class SilentEventSource { addEventListener() {} close() {} }
    Object.defineProperty(window, "EventSource", { configurable: true, value: SilentEventSource });
  });
  await page.route("**/__lwc/proposals", async (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      proposals: [{
        file: ".lwc/proposals/review.json",
        id: "proposal-123456789abc",
        rootName: "atlas-wiki",
        summary: "Add reviewed source guidance",
        status: "proposed",
        createdAt: "2026-08-10T00:00:00.000Z",
        intake: {
          id: "intake-fedcba987654",
          sourceName: "review-notes.txt",
          sourceHash: "c".repeat(64),
          target: "concepts/Human Review.md",
          generator: "Codex",
        },
        changes: [{
          path: "concepts/Human Review.md",
          operation: "update",
          baseHash: "a".repeat(64),
          contentHash: "b".repeat(64),
          targetState: "unchanged",
          currentHash: "a".repeat(64),
          diff: [
            { kind: "context", text: "# Human Review" },
            { kind: "remove", text: "Apply changes directly." },
            { kind: "add", text: "Review the exact diff before apply." },
          ],
        }],
        topology: {
          addedLinks: [{ source: "concepts/Human Review.md", target: "Source Provenance", kind: "wikilink" }],
          removedLinks: [],
          conflicts: [],
        },
      }],
      issues: [],
    }),
  }));
  await page.route("**/__lwc/drafts", async (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ drafts: [], issues: [] }) }));
  await page.goto("/?live=1");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Changes/ }).click();
  await expect(page.getByTestId("changes-view")).toBeVisible();
  return errors;
}

async function openDraftsFixture(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    class SilentEventSource { addEventListener() {} close() {} }
    Object.defineProperty(window, "EventSource", { configurable: true, value: SilentEventSource });
  });
  await page.route("**/__lwc/proposals", async (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ proposals: [], issues: [] }) }));
  await page.route("**/__lwc/drafts", async (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      drafts: [{
        file: ".lwc/drafts/intake-123456789abc/intake.json",
        id: "intake-123456789abc",
        rootName: "atlas-wiki",
        status: "draft",
        state: "ready",
        createdAt: "2026-08-10T08:30:00.000Z",
        generator: "Codex",
        source: {
          name: "architecture-review.txt",
          path: "/local/research/architecture-review.txt",
          snapshot: ".source/architecture-review.txt",
          sha256: "a".repeat(64),
          bytes: 162,
          state: "verified",
          snapshotState: "verified",
          snapshotContent: "Decision: local Markdown remains the source of truth.\nEvidence: every generated change must enter a human review queue.",
        },
        draft: {
          path: "concepts/Controlled Knowledge.md",
          initialHash: "b".repeat(64),
          state: "edited",
          currentHash: "c".repeat(64),
          content: "---\ntitle: Controlled Knowledge\nkind: concept\n---\n\n# Controlled Knowledge\n\nAgent output is evidence-bound before it enters the Vault.",
          scope: "declared-only",
        },
        target: { operation: "create", currentHash: null },
        blockers: [],
      }],
      issues: [],
    }),
  }));
  await page.goto("/?live=1");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Drafts/ }).click();
  await expect(page.getByTestId("drafts-view")).toBeVisible();
  return errors;
}

test("@smoke filters the map and opens a relationship", async ({ page }, testInfo) => {
  const errors = await openWorkbench(page);
  await page.getByRole("searchbox", { name: "Search pages" }).fill("review");
  await expect(page.getByText("1 of 8")).toBeVisible();
  await page.getByRole("button", { name: "Concept", exact: true }).click();
  await expect(page.getByText("1 of 8")).toBeVisible();
  await page.getByRole("button", { name: /Human Review/ }).first().click();
  await expect(page.getByRole("heading", { name: "Human Review" })).toBeVisible();
  const evidenceRoute = page.getByLabel("Evidence route");
  await expect(evidenceRoute).toContainText("Source");
  await expect(evidenceRoute).toContainText("Structure");
  await expect(evidenceRoute).toContainText("Decision");
  await expect(evidenceRoute).toContainText("Human controlled");
  await expect(page.getByLabel("Agent context command")).toContainText("lwc context <vault>");
  await expect(page.getByLabel("Agent context command")).toContainText("--max-words 2000");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByLabel("Agent context command").getByRole("button", { name: "Copy" }).click();
  await expect(page.getByLabel("Agent context command").getByRole("button", { name: "Copied" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("map-context.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("@smoke opens the Chinese technology radar and searches its mock knowledge", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?lang=zh-CN");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.getByText("智能体工程热点雷达").first()).toBeVisible();
  await expect(page.getByText("9 个模拟页面 · 来源可核对 · 不读取本地文件")).toBeVisible();
  const search = page.getByRole("searchbox", { name: "搜索页面" });
  await search.fill("DeepSeek");
  await expect(page.getByText("2 / 9")).toBeVisible();
  await page.getByRole("button", { name: /DeepSeek Harness/ }).first().click();
  await expect(page.getByLabel("证据路径")).toContainText("来源");
  await expect(page.getByLabel("证据路径")).toContainText("由人决定");
  await expect(page.getByRole("link", { name: "EN" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("agent-trends-zh.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("@smoke inspects OKF trust signals without offering execution", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?graph=/okf-graph.json");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("OKF 0.2")).toBeVisible();
  await page.getByRole("button", { name: /Release readiness/ }).click();
  const trust = page.getByLabel("Knowledge trust signals");
  await expect(trust).toContainText("Evidence, not a score");
  await expect(trust).toContainText("Human reviewed");
  await expect(trust).toContainText("human:maintainer");
  await expect(trust).toContainText("Fresh through 2026-12-31");
  await expect(trust).toContainText("Local release policy");
  await page.getByRole("button", { name: /Release check/ }).click();
  await expect(page.getByLabel("Knowledge trust signals")).toContainText("Attested computation");
  await expect(page.getByLabel("Knowledge trust signals")).toContainText("Contract only — not executed");
  expect(await page.getByRole("button", { name: /^(run|execute)/i }).count()).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("okf-trust.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("@critical surfaces OKF checker findings and preserves extension metadata", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(/\/okf-graph\.json$/, async (route) => {
    if (new URL(route.request().url()).pathname !== "/okf-graph.json") return route.continue();
    const response = await route.fetch();
    const graph = await response.json();
    graph.okf = {
      ...graph.okf,
      conformant: false,
      issues: [
        { level: "error", code: "OKF_INVALID_VERIFIED", path: "metrics/release-readiness.md", message: "verified contains an invalid ISO 8601 datetime" },
        { level: "warning", code: "OKF_INVALID_VERSION", path: "index.md", message: "best-effort compatibility warning" },
      ],
    };
    const metric = graph.nodes.find((node: { path: string }) => node.path === "metrics/release-readiness.md");
    metric.resource = "urn:example:release-readiness";
    metric.metadata = { ...metric.metadata, experimental_route: { mode: "shadow" } };
    await route.fulfill({ response, json: graph });
  });
  await page.goto("/?graph=/okf-graph.json");
  await expect(page.getByLabel("OKF checker findings")).toContainText("1 errors · 1 warnings");
  await expect(page.getByLabel("OKF checker findings")).toContainText("OKF_INVALID_VERIFIED");
  await page.getByRole("button", { name: /Release readiness/ }).click();
  await expect(page.getByText("urn:example:release-readiness")).toBeVisible();
  await page.getByText("Additional metadata").click();
  await expect(page.getByText(/experimental_route/)).toBeVisible();
  await page.getByRole("button", { name: "Health", exact: true }).click();
  await expect(page.getByText("1 errors · 2 warnings")).toBeVisible();
  expect(errors).toEqual([]);
});

test("@smoke health view reports only compiled graph facts", async ({ page }) => {
  const errors = await openWorkbench(page);
  await page.getByRole("button", { name: "Health", exact: true }).click();
  await expect(page.getByTestId("health-view")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Knowledge you can trust." })).toBeVisible();
  await expect(page.getByText("No structural issues found")).toBeVisible();
  await expect(page.getByText("0 errors · 0 warnings")).toBeVisible();
  await expect(page.getByText("✓ all targets resolve")).toBeVisible();
  await expect(page.getByText("✓ every page connected")).toBeVisible();
  await page.getByRole("button", { name: /Agent Knowledge Atlas/ }).click();
  await expect(page.getByTestId("map-view")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Agent Knowledge Atlas" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("@smoke reviews proposal lifecycle, hashes, and exact diff without applying", async ({ page }, testInfo) => {
  const errors = await openChangesFixture(page);
  await expect(page.getByText("Add reviewed source guidance").first()).toBeVisible();
  await expect(page.getByText("Needs review").first()).toBeVisible();
  await expect(page.getByText("Human decision required")).toBeVisible();
  await expect(page.getByTestId("topology-preview")).toContainText("Change blueprint");
  await expect(page.getByTestId("topology-preview")).toContainText("Source Provenance");
  await expect(page.getByTestId("topology-preview")).toContainText("0 conflicts");
  await expect(page.getByText("a".repeat(64))).toBeVisible();
  await expect(page.getByText("b".repeat(64))).toBeVisible();
  await expect(page.getByLabel("Diff for concepts/Human Review.md")).toContainText("Apply changes directly.");
  await expect(page.getByLabel("Diff for concepts/Human Review.md")).toContainText("Review the exact diff before apply.");
  await expect(page.getByText("The Workbench does not make this decision.")).toBeVisible();
  await expect(page.getByLabel("Source intake provenance")).toContainText("review-notes.txt");
  await expect(page.getByLabel("Source intake provenance")).toContainText("Codex");
  await expect(page.getByText(/lwc proposal review/)).toBeVisible();
  expect(await page.getByRole("button", { name: /apply/i }).count()).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("changes.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("@smoke traces a source intake into an isolated draft without mutating the Vault", async ({ page }, testInfo) => {
  const errors = await openDraftsFixture(page);
  await expect(page.getByRole("heading", { name: "concepts/Controlled Knowledge.md" })).toBeVisible();
  await expect(page.getByText("Ready to propose").first()).toBeVisible();
  await expect(page.getByLabel("Source to proposal evidence chain")).toContainText("Original + snapshot verified");
  await expect(page.getByLabel("Source to proposal evidence chain")).toContainText("Edited in isolated scope");
  await expect(page.getByLabel("Source to proposal evidence chain")).toContainText("Not in review queue");
  await expect(page.getByText("architecture-review.txt").first()).toBeVisible();
  await expect(page.getByText("One declared target")).toBeVisible();
  await expect(page.getByText("Agent output is evidence-bound before it enters the Vault.")).toBeVisible();
  await expect(page.getByText(/lwc intake propose/)).toBeVisible();
  expect(await page.getByRole("button", { name: /^(review|apply)/i }).count()).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("drafts.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("@smoke remains usable on a narrow viewport", async ({ page }, testInfo) => {
  const errors = await openWorkbench(page);
  await expect(page.getByRole("group", { name: "Filter by page type" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search pages" })).toBeEditable();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Health", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("workbench.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("@critical exposes empty search state and remains keyboard reachable", async ({ page }) => {
  const errors = await openWorkbench(page);
  const search = page.getByRole("searchbox", { name: "Search pages" });
  await search.focus();
  await expect(search).toBeFocused();
  await search.fill("definitely-no-such-page");
  await expect(page.getByText("0 of 8")).toBeVisible();
  expect(errors).toEqual([]);
});

test("@critical explains a missing graph instead of crashing", async ({ page }) => {
  await page.goto("/?graph=/missing-graph.json");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "The knowledge map could not open." })).toBeVisible();
  await expect(page.getByText(/not JSON/)).toBeVisible();
});
