import { expect, test } from "@playwright/test";

test("serves production assets from the GitHub Pages subpath without eager-loading Gemma", async ({
  page,
}) => {
  const failedAssets: string[] = [];
  const requestedScripts: string[] = [];
  const pageErrors: Error[] = [];
  page.on("response", (response) => {
    const request = response.request();
    if (["document", "script", "stylesheet"].includes(request.resourceType()) && !response.ok()) {
      failedAssets.push(`${response.status()} ${response.url()}`);
    }
    if (request.resourceType() === "script") requestedScripts.push(response.url());
  });
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto("./");
  await expect(page.getByRole("heading", { name: "タイムテーブルを追加" })).toBeVisible();

  expect(page.url()).toContain("/my-timetable/");
  expect(failedAssets).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(requestedScripts.some((url) => /gemma-[^/]+\.js$/u.test(url))).toBe(false);
});
