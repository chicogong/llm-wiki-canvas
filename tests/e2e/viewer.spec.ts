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
  await page.goto("/?live=1");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Changes/ }).click();
  await expect(page.getByTestId("changes-view")).toBeVisible();
  return errors;
}

test("@smoke filters the map and opens a relationship", async ({ page }) => {
  const errors = await openWorkbench(page);
  await page.getByRole("searchbox", { name: "Search pages" }).fill("review");
  await expect(page.getByText("1 of 8")).toBeVisible();
  await page.getByRole("button", { name: "Concept", exact: true }).click();
  await expect(page.getByText("1 of 8")).toBeVisible();
  await page.getByRole("button", { name: /Human Review/ }).first().click();
  await expect(page.getByRole("heading", { name: "Human Review" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("@smoke health view reports only compiled graph facts", async ({ page }) => {
  const errors = await openWorkbench(page);
  await page.getByRole("button", { name: "Health", exact: true }).click();
  await expect(page.getByTestId("health-view")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Knowledge you can trust." })).toBeVisible();
  await expect(page.getByText("No structural issues found")).toBeVisible();
  await expect(page.getByText("0 errors · 0 warnings")).toBeVisible();
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
  await expect(page.getByText(/lwc proposal review/)).toBeVisible();
  expect(await page.getByRole("button", { name: /apply/i }).count()).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("changes.png"), fullPage: true });
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
