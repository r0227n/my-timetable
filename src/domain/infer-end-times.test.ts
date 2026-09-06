import { describe, expect, it } from "vitest";
import { createBlankSchedule, createEmptyDocument } from "./timetable";
import { inferMissingEndTimes } from "./infer-end-times";

describe("inferMissingEndTimes", () => {
  it("uses the next start within 60 minutes and 30 minutes for the final slot", () => {
    const document = createEmptyDocument();
    document.schedules = [
      createBlankSchedule({ id: "first", stage: "A", startTime: "13:00" }),
      createBlankSchedule({ id: "last", stage: "A", startTime: "13:45" }),
    ];

    expect(inferMissingEndTimes(document).schedules).toEqual([
      expect.objectContaining({ endTime: "13:45", endTimeSource: "inferred_next_start", verified: false }),
      expect.objectContaining({ endTime: "14:15", endTimeSource: "inferred_default", verified: false }),
    ]);
  });

  it("caps a long gap at 60 minutes and preserves explicit end times", () => {
    const document = createEmptyDocument();
    document.schedules = [
      createBlankSchedule({ id: "first", stage: "A", startTime: "13:00" }),
      createBlankSchedule({
        id: "explicit",
        stage: "A",
        startTime: "15:00",
        endTime: "15:40",
        endTimeSource: "explicit",
      }),
    ];

    expect(inferMissingEndTimes(document).schedules).toEqual([
      expect.objectContaining({ endTime: "14:00", endTimeSource: "inferred_default" }),
      expect.objectContaining({ endTime: "15:40", endTimeSource: "explicit" }),
    ]);
  });
});

it("does not infer an activity's end from a different booth or activity type", () => {
  const document = createEmptyDocument();
  document.schedules = [
    createBlankSchedule({ id: "live", type: "live", stage: "Hall", startTime: "13:00" }),
    createBlankSchedule({ id: "merch-a", type: "merch", stage: "Hall", booth: "A", startTime: "13:10" }),
    createBlankSchedule({ id: "merch-b", type: "merch", stage: "Hall", booth: "B", startTime: "13:20" }),
  ];
  expect(inferMissingEndTimes(document).schedules.map((item) => item.endTime)).toEqual([
    "13:30",
    "13:40",
    "13:50",
  ]);
});
