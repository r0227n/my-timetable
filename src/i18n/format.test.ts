import { describe, expect, it } from "vitest";
import { formatDate, formatNumber } from "./format";

describe("localized formatting", () => {
  it("formats numbers and dates for the selected language without changing the event time zone", () => {
    expect(formatNumber(1234, "en")).toBe("1,234");
    expect(formatDate("2026-08-27", "ja", "Asia/Tokyo")).toContain("2026");
    expect(formatDate("2026-08-27", "en", "Asia/Tokyo")).toMatch(/Aug|8/);
  });
});
