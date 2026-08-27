import { afterEach, describe, expect, it, vi } from "vitest";
import { parseGemmaDocument } from "./gemma";

const valid = {
  schemaVersion: 1,
  event: {
    name: "Festival",
    date: null,
    timezone: "Asia/Tokyo",
    venue: null,
    openTime: null,
    startTime: null,
    notes: [],
  },
  schedules: [
    {
      id: "1",
      artist: "Artist",
      type: "live",
      startTime: "10:00",
      endTime: "10:30",
      relativeTimeLabel: null,
      stage: null,
      booth: null,
      attributes: {},
      confidence: "high",
      verified: false,
      sourceRegions: [],
    },
  ],
};

describe("parseGemmaDocument", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts valid JSON wrapped in a code fence", () => {
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const result = parseGemmaDocument(`\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``);

    expect(result.event.name).toBe("Festival");
    expect(consoleInfo).toHaveBeenNthCalledWith(1, "[My Timetable][Gemma] Raw result", expect.any(String));
    expect(consoleInfo).toHaveBeenNthCalledWith(2, "[My Timetable][Gemma] Structured result", result);
  });

  it("keeps valid data and marks invalid fields as unresolved", () => {
    const result = parseGemmaDocument(
      JSON.stringify({
        ...valid,
        schedules: [{ ...valid.schedules[0], type: "concert", startTime: "morning", confidence: "certain" }],
      }),
    );

    expect(result.event.name).toBe("Festival");
    expect(result.schedules[0]).toEqual(
      expect.objectContaining({ type: "other", startTime: null, confidence: "low", verified: false }),
    );
  });

  it("repairs a response truncated after the schedules array and keeps a partial date unresolved", () => {
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const truncated = JSON.stringify({
      ...valid,
      event: { ...valid.event, date: "9/22" },
    }).slice(0, -1);

    const result = parseGemmaDocument(truncated);

    expect(result.event.date).toBeNull();
    expect(result.schedules).toHaveLength(1);
    expect(consoleInfo).toHaveBeenLastCalledWith("[My Timetable][Gemma] Structured result", result);
  });

  it("ignores an extra closing brace after a complete JSON document", () => {
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const result = parseGemmaDocument(`${JSON.stringify(valid)}}`);

    expect(result).toEqual(valid);
    expect(consoleInfo).toHaveBeenLastCalledWith("[My Timetable][Gemma] Structured result", result);
  });
});
