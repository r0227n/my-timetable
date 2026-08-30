import { describe, expect, it } from "vitest";
import { createBlankSchedule } from "./timetable";
import { detectConflicts, findDuplicateIds, findInvalidTimeRangeIds } from "./conflicts";

describe("detectConflicts", () => {
  it("detects overlapping schedules", () => {
    const first = createBlankSchedule({ id: "a", artist: "A", startTime: "10:00", endTime: "10:30" });
    const second = createBlankSchedule({ id: "b", artist: "B", startTime: "10:20", endTime: "10:50" });
    expect(detectConflicts([first, second])).toEqual([{ firstId: "a", secondId: "b", kind: "overlap" }]);
  });

  it("does not report overlaps across different dates", () => {
    const first = createBlankSchedule({
      id: "a",
      date: "2026-10-11",
      startTime: "10:00",
      endTime: "10:30",
    });
    const second = createBlankSchedule({
      id: "b",
      date: "2026-10-12",
      startTime: "10:00",
      endTime: "10:30",
    });

    expect(detectConflicts([first, second])).toEqual([]);
  });

  it("warns when the travel buffer is too short", () => {
    const first = createBlankSchedule({ id: "a", artist: "A", startTime: "10:00", endTime: "10:30" });
    const second = createBlankSchedule({ id: "b", artist: "B", startTime: "10:35", endTime: "11:00" });
    expect(detectConflicts([first, second], 10)[0].kind).toBe("tight");
  });

  it("reports schedules whose end is not after their start", () => {
    const reversed = createBlankSchedule({ id: "reversed", startTime: "11:00", endTime: "10:00" });
    const equal = createBlankSchedule({ id: "equal", startTime: "12:00", endTime: "12:00" });
    const valid = createBlankSchedule({ id: "valid", startTime: "13:00", endTime: "13:30" });

    expect(findInvalidTimeRangeIds([reversed, equal, valid])).toEqual(new Set(["reversed", "equal"]));
  });

  it("accepts a reversed clock range when the user marks it as ending next day", () => {
    const overnight = createBlankSchedule({
      id: "overnight",
      startTime: "23:30",
      endTime: "00:30",
      endsNextDay: true,
    });

    expect(findInvalidTimeRangeIds([overnight])).toEqual(new Set());
  });
});

describe("findDuplicateIds", () => {
  it("finds same artist, type and time", () => {
    const first = createBlankSchedule({ id: "a", artist: "Artist", startTime: "10:00", endTime: "10:30" });
    const second = createBlankSchedule({ id: "b", artist: "artist", startTime: "10:00", endTime: "10:30" });
    expect(findDuplicateIds([first, second])).toEqual(new Set(["a", "b"]));
  });
});
