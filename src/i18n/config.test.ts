import { describe, expect, it } from "vitest";
import { normalizeLanguage, resolveInitialLanguage } from "./config";

describe("UI language resolution", () => {
  it("prefers a supported saved language over browser languages", () => {
    expect(resolveInitialLanguage({ storedLanguage: "en", browserLanguages: ["ja-JP"] })).toBe("en");
  });

  it("uses the first supported browser language without persisting it", () => {
    expect(resolveInitialLanguage({ browserLanguages: ["fr-FR", "en-US", "ja-JP"] })).toBe("en");
    expect(localStorage.getItem("ui.language")).toBeNull();
  });

  it("falls back to Japanese and normalizes regional codes", () => {
    expect(normalizeLanguage("EN-us")).toBe("en");
    expect(resolveInitialLanguage({ browserLanguages: ["fr-FR"] })).toBe("ja");
  });
});
