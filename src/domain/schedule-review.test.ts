import { describe, expect, it } from "vitest";
import { createBlankSchedule, createEmptyDocument } from "./timetable";
import { canVerifySchedule, needsReview, selectableSchedules } from "./schedule-review";

const complete = createBlankSchedule({
  id: "complete",
  artist: "Artist",
  date: "2026-08-30",
  startTime: "10:00",
  endTime: "10:30",
  confidence: "high",
});

describe("schedule review rules", () => {
  it("requires an artist or title, date, and a consistent absolute or relative time", () => {
    const document = { ...createEmptyDocument(), schedules: [complete] };
    expect(canVerifySchedule(document, complete)).toBe(true);
    expect(canVerifySchedule(document, { ...complete, artist: "" })).toBe(false);
    expect(canVerifySchedule(document, { ...complete, artist: null, title: "終演後物販" })).toBe(true);
    expect(canVerifySchedule(document, { ...complete, date: null })).toBe(false);
    expect(canVerifySchedule(document, { ...complete, endTime: "09:00" })).toBe(false);
    expect(
      canVerifySchedule(document, {
        ...complete,
        startTime: null,
        endTime: null,
        relativeTimeLabel: "after the show",
      }),
    ).toBe(true);
    expect(
      canVerifySchedule(document, { ...complete, endTime: null, relativeTimeLabel: "about 10:00" }),
    ).toBe(false);
    expect(
      canVerifySchedule(document, { ...complete, startTime: null, relativeTimeLabel: "until 10:30" }),
    ).toBe(false);
  });

  it("includes unverified, low-confidence, and incomplete schedules in needs review", () => {
    const document = { ...createEmptyDocument(), schedules: [complete] };
    expect(needsReview(document, complete)).toBe(true);
    expect(needsReview(document, { ...complete, verified: true })).toBe(false);
    expect(needsReview(document, { ...complete, verified: true, confidence: "low" })).toBe(true);
    expect(needsReview(document, { ...complete, verified: true, artist: "" })).toBe(true);
  });

  it("only exposes complete verified schedules to selection", () => {
    const valid = { ...complete, verified: true };
    const document = {
      ...createEmptyDocument(),
      schedules: [
        valid,
        { ...valid, id: "unverified", verified: false },
        { ...valid, id: "bad", artist: "" },
      ],
    };
    expect(selectableSchedules(document).map((item) => item.id)).toEqual(["complete"]);
  });
});
