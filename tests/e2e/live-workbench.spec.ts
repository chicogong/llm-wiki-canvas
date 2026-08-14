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
  await page.getByRole("button", { name: /Changes/ }).click();
  await expect(page.getByRole("heading", { name: "Live browser review fixture" })).toBeVisible();
  await expect(page.getByLabel("Diff for concepts/Human Review.md")).toContainText("A reviewed proposal binds the intended Markdown");

  expect(await readFile(formalPage, "utf8")).toBe(before);
  expect(errors).toEqual([]);
});
