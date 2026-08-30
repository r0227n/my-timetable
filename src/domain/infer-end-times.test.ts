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

  it("keeps LIVE, merchandise, and booth lanes separate", () => {
    const document = createEmptyDocument();
    document.schedules = [
      createBlankSchedule({ id: "live-a", type: "live", stage: "Main", startTime: "10:00" }),
      createBlankSchedule({ id: "merch-a", type: "merch", booth: "A", startTime: "10:20" }),
      createBlankSchedule({ id: "live-next", type: "live", stage: "Main", startTime: "10:40" }),
      createBlankSchedule({ id: "merch-b", type: "merch", booth: "B", startTime: "10:50" }),
    ];

    const schedules = inferMissingEndTimes(document).schedules;
    expect(schedules.find((item) => item.id === "live-a")?.endTime).toBe("10:40");
    expect(schedules.find((item) => item.id === "merch-a")?.endTime).toBe("10:50");
    expect(schedules.find((item) => item.id === "merch-b")?.endTime).toBe("11:20");
  });
});
