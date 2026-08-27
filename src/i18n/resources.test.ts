import { describe, expect, it } from "vitest";
import jaCommon from "./locales/ja/common.json";
import enCommon from "./locales/en/common.json";
import jaUpload from "./locales/ja/upload.json";
import enUpload from "./locales/en/upload.json";
import jaAdjust from "./locales/ja/adjust.json";
import enAdjust from "./locales/en/adjust.json";
import jaAnalysis from "./locales/ja/analysis.json";
import enAnalysis from "./locales/en/analysis.json";
import jaReview from "./locales/ja/review.json";
import enReview from "./locales/en/review.json";
import jaSelection from "./locales/ja/selection.json";
import enSelection from "./locales/en/selection.json";
import jaTimeline from "./locales/ja/timeline.json";
import enTimeline from "./locales/en/timeline.json";
import jaExport from "./locales/ja/export.json";
import enExport from "./locales/en/export.json";

function keys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key));
}

describe("translation resources", () => {
  it.each([
    ["common", jaCommon, enCommon],
    ["upload", jaUpload, enUpload],
    ["adjust", jaAdjust, enAdjust],
    ["analysis", jaAnalysis, enAnalysis],
    ["review", jaReview, enReview],
    ["selection", jaSelection, enSelection],
    ["timeline", jaTimeline, enTimeline],
    ["export", jaExport, enExport],
  ])("keeps Japanese and English %s keys aligned", (_, japanese, english) => {
    expect(keys(english).toSorted()).toEqual(keys(japanese).toSorted());
  });
});
