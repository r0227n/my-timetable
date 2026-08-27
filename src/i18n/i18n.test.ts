import { describe, expect, it } from "vitest";
import { changeUiLanguage } from "./i18n";

describe("explicit UI language changes", () => {
  it("updates the document language and persists only an explicit selection", async () => {
    expect(localStorage.getItem("ui.language")).toBeNull();

    await changeUiLanguage("en");

    expect(document.documentElement.lang).toBe("en");
    expect(localStorage.getItem("ui.language")).toBe("en");
  });
});
