import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

test("reviews a real local proposal without modifying formal Markdown", async ({ page }) => {
  const formalPage = path.resolve(".lwc/e2e-live/vault/concepts/Human Review.md");
  const before = await readFile(formalPage, "utf8");
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/?live=1");
  await expect(page.getByTestId("map-view")).toBeVisible();
  await expect(page.getByText("9 of 9")).toBeVisible();
  await page.getByRole("button", { name: /Changes/ }).click();
  await expect(page.getByRole("heading", { name: "Live browser review fixture" })).toBeVisible();
  await expect(page.getByLabel("Diff for concepts/Human Review.md")).toContainText("A reviewed proposal binds the intended Markdown");

  expect(await readFile(formalPage, "utf8")).toBe(before);
  expect(errors).toEqual([]);
});

test("localizes the live review queue in Chinese", async ({ page }) => {
  await page.goto("/?live=1&lang=zh-CN");
  await page.getByRole("button", { name: /变更/ }).click();
  await expect(page.getByTestId("changes-view").getByRole("heading", { name: "变更收件箱" })).toBeVisible();
  await expect(page.getByText("等待审查").first()).toBeVisible();
  await expect(page.getByText("需要人工决定")).toBeVisible();
  await expect(page.getByText("工作台不会替你做决定。")).toBeVisible();
  await expect(page.getByRole("group", { name: "筛选 Proposal" })).toBeVisible();
});
