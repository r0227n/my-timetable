import { expect, test } from "@playwright/test";
import path from "node:path";

test("analyzes an uploaded timetable and opens review", async ({ page }, testInfo) => {
  const fake = testInfo.project.name === "analysis-fake";
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto("./");
  await page
    .locator('input[type="file"]')
    .setInputFiles(path.join(import.meta.dirname, "fixtures/timetable.png"));
  await expect(page.getByRole("heading", { name: "画像を読みやすく整える" })).toBeVisible();
  await page.getByRole("button", { name: "解析を開始" }).click();
  await expect(page.getByRole("heading", { name: "画像を読み取っています" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "読み取り結果を確認" })).toBeVisible();

  const rows = page.locator(".schedule-table tbody tr");
  expect(await rows.count()).toBeGreaterThan(0);
  await expect(rows.first().locator("td input").first()).not.toHaveValue("");
  if (fake) {
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0).locator("td input").first()).toHaveValue("ALPHA");
    await expect(rows.nth(1).locator("td input").first()).toHaveValue("ベータ");
  }
  expect(pageErrors).toEqual([]);
});
