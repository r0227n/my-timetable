import { describe, expect, it } from "vitest";
import i18n, { changeUiLanguage } from "./i18n";

describe("explicit UI language changes", () => {
  it("loads only the initial screen namespaces during startup", () => {
    expect(i18n.options.ns).toEqual(["common", "upload"]);
    expect(i18n.hasResourceBundle("ja", "adjust")).toBe(false);
  });

  it("updates the document language and persists only an explicit selection", async () => {
    expect(localStorage.getItem("ui.language")).toBeNull();

    await changeUiLanguage("en");

    expect(document.documentElement.lang).toBe("en");
    expect(localStorage.getItem("ui.language")).toBe("en");
  });
});
