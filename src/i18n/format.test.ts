import { describe, expect, it } from "vitest";
import { formatDate, formatNumber } from "./format";

describe("localized formatting", () => {
  it("formats numbers and dates for the selected language without changing the event time zone", () => {
    expect(formatNumber(1234, "en")).toBe("1,234");
    expect(formatDate("2026-08-27", "ja", "Asia/Tokyo")).toContain("2026");
    expect(formatDate("2026-08-27", "en", "Asia/Tokyo")).toMatch(/Aug|8/);
  });

  it("preserves a calendar date in UTC+14", () => {
    expect(formatDate("2025-01-01", "en", "Pacific/Kiritimati")).toMatch(/Jan|1/);
    expect(formatDate("2025-01-01", "en", "Pacific/Kiritimati")).not.toMatch(/Jan 2|2 Jan/);
  });

  it("falls back to the original value for invalid dates or time zones", () => {
    expect(formatDate("2026-13-40", "en", "Asia/Tokyo")).toBe("2026-13-40");
    expect(formatDate("2026-08-27", "en", "Invalid/Zone")).toBe("2026-08-27");
  });
});
