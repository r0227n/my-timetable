import { expect, test as base, type Page } from "@playwright/test";
import path from "node:path";

const timetableImage = path.join(import.meta.dirname, "fixtures/timetable.png");
const test = base.extend<{ pageErrorGuard: void }>({
  pageErrorGuard: [
    async ({ page }, use) => {
      const pageErrors: Error[] = [];
      page.on("pageerror", (error) => pageErrors.push(error));
      await use();
      expect(pageErrors).toEqual([]);
    },
    { auto: true },
  ],
});

async function openUpload(page: Page): Promise<void> {
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "タイムテーブルを追加" })).toBeVisible();
}

async function uploadTimetable(page: Page): Promise<void> {
  await openUpload(page);
  await page.locator('input[type="file"]').setInputFiles(timetableImage);
  await expect(page.getByRole("heading", { name: "画像を読みやすく整える" })).toBeVisible();
}

async function openReview(page: Page): Promise<void> {
  await uploadTimetable(page);
  await page.getByRole("button", { name: "解析を開始" }).click();
  await expect(page.getByRole("heading", { name: "画像を読み取っています" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "読み取り結果を確認" })).toBeVisible();
}

async function openSelection(page: Page): Promise<void> {
  await openReview(page);
  await page.getByRole("button", { name: /確認可能な.*件を一括確認/u }).click();
  await page.getByRole("button", { name: "予定を選ぶ" }).click();
  await expect(page.getByRole("heading", { name: "行きたい予定を選ぶ" })).toBeVisible();
}

async function openTimeline(page: Page): Promise<void> {
  await openSelection(page);
  await page.getByRole("button", { name: "タイムラインを作る" }).click();
  await expect(page.getByRole("heading", { name: "タイムラインを整える" })).toBeVisible();
}

async function openManualReview(page: Page): Promise<void> {
  await openUpload(page);
  await page.getByRole("button", { name: "画像を使わず手入力ではじめる" }).click();
  await expect(page.getByRole("heading", { name: "読み取り結果を確認" })).toBeVisible();
}

test.describe("全画面の正常系", () => {
  test("E2E-N-001 画像の取込からSVG・PNG・ICSの保存まで完了できる", async ({ page }) => {
    await uploadTimetable(page);

    await page.getByRole("button", { name: "右へ90°" }).click();
    await expect(page.locator(".image-preview")).toHaveAttribute("style", /rotate\(90deg\)/u);
    await page.getByRole("slider", { name: "明るさ" }).fill("120");
    await expect(page.getByRole("slider", { name: "明るさ" })).toHaveValue("120");
    await page.getByRole("button", { name: "元に戻す" }).click();
    await expect(page.getByRole("slider", { name: "明るさ" })).toHaveValue("100");

    await page.getByRole("button", { name: "解析を開始" }).click();
    await expect(page.getByRole("heading", { name: "画像を読み取っています" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "読み取り結果を確認" })).toBeVisible();
    await expect(page.locator(".schedule-table tbody tr")).toHaveCount(2);
    await expect(page.locator(".ocr-evidence")).toContainText("10:00 ALPHA");

    await page.getByRole("button", { name: /確認可能な.*件を一括確認/u }).click();
    await expect(page.getByRole("button", { name: "予定を選ぶ" })).toBeEnabled();
    await page.getByRole("button", { name: "予定を選ぶ" }).click();

    await expect(page.getByRole("heading", { name: "行きたい予定を選ぶ" })).toBeVisible();
    await expect(page.locator(".selected-badge")).toContainText("2");
    await expect(page.getByLabel("時間が重複しています")).toHaveCount(2);
    await expect(page.getByText("1件の注意")).toBeVisible();
    await page.getByLabel("移動時間の余裕").selectOption("0");
    await expect(page.getByText("時間の重なりはありません")).toBeVisible();
    await page.getByRole("button", { name: "タイムラインを作る" }).click();

    await expect(page.getByRole("heading", { name: "タイムラインを整える" })).toBeVisible();
    await page.getByLabel("タイトル").fill("MY FESTIVAL PLAN");
    await page.getByLabel("レイアウト").selectOption("horizontal");
    await page.getByLabel("出力サイズ").selectOption("socialLandscape");
    await expect(page.getByLabel("幅")).toHaveValue("1600");
    await expect(page.getByLabel("高さ")).toHaveValue("900");
    const previewSource = await page.getByAltText("生成したタイムラインのプレビュー").getAttribute("src");
    expect(decodeURIComponent(previewSource ?? "")).toContain("MY FESTIVAL PLAN");
    await page.getByRole("button", { name: "出力へ進む" }).click();

    await expect(page.getByRole("heading", { name: "タイムラインを書き出す" })).toBeVisible();
    await expect(page.getByText("出力対象は2件です。")).toBeVisible();

    const svgDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "SVGを保存" }).click();
    expect((await svgDownload).suggestedFilename()).toMatch(/\.svg$/u);

    const pngDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "PNGを保存" }).click();
    expect((await pngDownload).suggestedFilename()).toMatch(/\.png$/u);
    await expect(page.getByText("PNGを保存しました。")).toBeVisible();

    const icsDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "ICSを保存" }).click();
    expect((await icsDownload).suggestedFilename()).toMatch(/\.ics$/u);
    await expect(page.getByText("ICSを保存しました。")).toBeVisible();
  });

  test("E2E-N-002 共通ヘッダーでテーマと言語を切り替え、設定を維持できる", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "gpu", { configurable: true, value: undefined });
    });
    await openUpload(page);

    await page.getByRole("button", { name: "ダークテーマにする" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.getByRole("button", { name: /表示言語/u }).click();
    await page.getByRole("menuitemradio", { name: "English" }).click();
    await expect(page.getByRole("heading", { name: "Add a timetable" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await page.getByRole("button", { name: /Selected model/u }).click();
    await expect(page.getByRole("menuitemradio", { name: /Gemma 4 E4B/u })).toBeDisabled();
    await expect(page.getByText(/Unavailable because this device does not support WebGPU/u)).toBeVisible();
  });
});

test.describe("全画面の異常系・境界値", () => {
  test("E2E-A-001 アップロード画面は非対応形式、複数画像、20MB超過を拒否する", async ({ page }) => {
    await openUpload(page);
    const fileInput = page.locator('input[type="file"]');

    await fileInput.setInputFiles({
      name: "schedule.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("text"),
    });
    await expect(page.getByRole("alert")).toHaveText("JPEG、PNG、WebP形式の画像を選択してください。");

    await fileInput.setInputFiles([timetableImage, timetableImage]);
    await expect(page.getByRole("alert")).toHaveText("画像は1枚だけ選択してください。");

    await fileInput.setInputFiles({
      name: "oversize.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(20 * 1024 * 1024 + 1),
    });
    await expect(page.getByRole("alert")).toHaveText("画像サイズは20MB以下にしてください。");
    await expect(page.getByRole("heading", { name: "タイムテーブルを追加" })).toBeVisible();
  });

  test("E2E-A-002 画像として復号できない入力は解析エラーとなり画像調整へ戻せる", async ({ page }) => {
    await openUpload(page);
    await page.locator('input[type="file"]').setInputFiles({
      name: "broken.png",
      mimeType: "image/png",
      buffer: Buffer.from("not a png"),
    });
    await expect(page.getByRole("heading", { name: "画像を読みやすく整える" })).toBeVisible();
    await page.getByRole("button", { name: "解析を開始" }).click();

    await expect(page.getByRole("heading", { name: "解析を完了できませんでした" })).toBeVisible();
    await expect(page.locator(".analysis-error-code code")).toHaveText("IMAGE_LOAD_FAILED");
    await expect(page.getByText("画像の準備で失敗しました")).toBeVisible();
    await page.getByRole("button", { name: "画像調整へ戻る" }).click();
    await expect(page.getByRole("heading", { name: "画像を読みやすく整える" })).toBeVisible();
  });

  test("E2E-A-003 OCR失敗時は診断情報を表示し、OCRを再試行できる", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("e2e.analysisScenario", "ocr-error-once"));
    await uploadTimetable(page);
    await page.getByRole("button", { name: "解析を開始" }).click();

    await expect(page.getByRole("heading", { name: "解析を完了できませんでした" })).toBeVisible();
    await expect(page.locator(".analysis-error-code code")).toHaveText("OCR_EXECUTION_FAILED");
    await expect(page.getByRole("button", { name: "OCRを再試行" })).toBeVisible();
    await expect(page.getByRole("button", { name: "画像調整へ戻る" })).toBeVisible();
    await page.getByText("診断情報を表示").click();
    const diagnostics = page.locator(".analysis-diagnostics pre");
    await expect(diagnostics).toContainText("Stage: ocr");
    await expect(diagnostics).not.toContainText("timetable.png");
    await expect(diagnostics).not.toContainText("ALPHA");
    await page.getByRole("button", { name: "OCRを再試行" }).click();
    await expect(page.getByRole("heading", { name: "読み取り結果を確認" })).toBeVisible();
    expect(await analysisCallCount(page, "ocr")).toBe(2);
  });

  test("E2E-A-004 Gemma失敗時はOCRを再実行せずGemmaだけ再試行できる", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("e2e.analysisScenario", "gemma-error-once"));
    await uploadTimetable(page);
    await page.getByRole("button", { name: "解析を開始" }).click();

    await expect(page.locator(".analysis-error-code code")).toHaveText("GEMMA_EXECUTION_FAILED");
    await expect(page.getByRole("button", { name: "Gemmaだけ再試行" })).toBeVisible();
    await page.getByRole("button", { name: "Gemmaだけ再試行" }).click();
    await expect(page.getByRole("heading", { name: "読み取り結果を確認" })).toBeVisible();
    expect(await analysisCallCount(page, "ocr")).toBe(1);
    expect(await analysisCallCount(page, "gemma")).toBe(2);
  });

  test("E2E-A-005 解析をキャンセルするとエラーを表示せず画像調整へ戻る", async ({ page }) => {
    await uploadTimetable(page);
    await page.getByRole("button", { name: "解析を開始" }).click();
    await expect(page.getByRole("heading", { name: "画像を読み取っています" })).toBeVisible();
    await page.getByRole("button", { name: "解析を中止" }).click();
    await expect(page.getByRole("heading", { name: "画像を読みやすく整える" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "解析を完了できませんでした" })).toHaveCount(0);
  });

  test("E2E-A-006 確認画面は必須項目不足と時刻矛盾の予定を選択対象にしない", async ({ page }) => {
    await openManualReview(page);
    const next = page.getByRole("button", { name: "予定を選ぶ" });
    await expect(next).toBeDisabled();
    await expect(page.getByText(/出演者名、開催日、時刻/u)).toBeVisible();

    await page.getByLabel("既定の開催日").fill("2026-09-12");
    await page.getByLabel("出演者名").fill("ALPHA");
    await page.getByLabel("開始時刻").fill("12:00");
    await page.getByLabel("終了時刻").fill("11:00");
    await expect(page.getByText("終了時刻は開始時刻より後にしてください")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "ALPHAを確認済みにする" })).toBeDisabled();

    await page.getByLabel("終了時刻").fill("13:00");
    await page.getByRole("checkbox", { name: "ALPHAを確認済みにする" }).check();
    await expect(next).toBeEnabled();
  });

  test("E2E-A-007 予定選択画面は0件選択や検索0件を扱い、続行を抑止する", async ({ page }) => {
    await openSelection(page);
    await page.getByLabel("出演者名を検索").fill("該当なし");
    await expect(page.getByText("条件に一致する予定がありません。")).toBeVisible();
    await page.getByLabel("出演者名を検索").fill("");

    await page.getByRole("button", { name: "全解除" }).click();
    await expect(page.getByRole("button", { name: "タイムラインを作る" })).toBeDisabled();
    await expect(page.getByText("左の一覧から予定を選んでください。")).toBeVisible();
    await page.getByRole("button", { name: "表示中を全選択" }).click();
    await expect(page.getByRole("button", { name: "タイムラインを作る" })).toBeEnabled();
  });

  test("E2E-A-008 タイムライン編集画面は最小値未満のカスタムサイズを不正と判定する", async ({ page }) => {
    await openTimeline(page);
    const width = page.getByLabel("幅");
    await width.fill("319");
    expect(await width.evaluate((element: HTMLInputElement) => element.checkValidity())).toBe(false);
    await width.fill("320");
    expect(await width.evaluate((element: HTMLInputElement) => element.checkValidity())).toBe(true);
  });

  test("E2E-A-009 日時未確定の予定はエクスポート画面でカレンダー出力から除外する", async ({ page }) => {
    await openManualReview(page);
    await page.getByLabel("既定の開催日").fill("2026-09-12");
    await page.getByLabel("出演者名").fill("終演後トーク");
    await page.getByLabel("相対時刻表現").fill("終演後");
    await page.getByRole("checkbox", { name: "終演後トークを確認済みにする" }).check();
    await page.getByRole("button", { name: "予定を選ぶ" }).click();
    await page.getByRole("button", { name: "タイムラインを作る" }).click();
    await page.getByRole("button", { name: "出力へ進む" }).click();

    await expect(page.getByRole("heading", { name: "タイムラインを書き出す" })).toBeVisible();
    await expect(page.getByText(/1件を除外します/u)).toBeVisible();
    await expect(page.getByRole("button", { name: "ICSを保存" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Google Calendarへ登録" })).toBeDisabled();
    await expect(page.getByText("Google OAuthクライアント設定後に利用できます。")).toBeVisible();
  });
});

async function analysisCallCount(page: Page, stage: "ocr" | "gemma"): Promise<number> {
  return page.evaluate((key) => Number(sessionStorage.getItem(`e2e.${key}Calls`) ?? 0), stage);
}
