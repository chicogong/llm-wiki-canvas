import { expect, test, type Page } from "@playwright/test";

async function openAtlas(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: /LLM Wiki/ })).toBeVisible();
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  return errors;
}

test("@smoke filters the atlas and opens a relation card", async ({ page }) => {
  const errors = await openAtlas(page);
  await page.getByRole("searchbox").fill("review");
  await expect(page.getByText("01 / 08")).toBeVisible();
  await page.getByRole("button", { name: "概念", exact: true }).click();
  await expect(page.getByText("01 / 08")).toBeVisible();
  await page.getByRole("button", { name: /Human Review/ }).first().click();
  await expect(page.getByRole("heading", { name: "Human Review" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("@smoke remains usable on a narrow viewport", async ({ page }, testInfo) => {
  const errors = await openAtlas(page);
  await expect(page.getByRole("group", { name: "按类型筛选" })).toBeVisible();
  await expect(page.getByRole("searchbox")).toBeEditable();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("atlas.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("@critical exposes empty search state and remains keyboard reachable", async ({ page }) => {
  const errors = await openAtlas(page);
  const search = page.getByRole("searchbox");
  await page.keyboard.press("Tab");
  await expect(search).toBeFocused();
  await search.fill("definitely-no-such-page");
  await expect(page.getByText("00 / 08")).toBeVisible();
  expect(errors).toEqual([]);
});

test("@critical explains a missing graph instead of crashing", async ({ page }) => {
  await page.goto("/?graph=/missing-graph.json");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "图谱没有打开" })).toBeVisible();
  await expect(page.getByText(/响应不是 JSON/)).toBeVisible();
});
