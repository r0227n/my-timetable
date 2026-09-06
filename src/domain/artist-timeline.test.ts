import { describe, expect, it } from "vitest";
import { groupArtistSchedules, timelineTimeLabel } from "./artist-timeline";
import { createBlankSchedule, createEmptyDocument } from "./timetable";

const document = createEmptyDocument();
document.event.date = "2026-09-12";

describe("artist timeline grouping", () => {
  it("groups selected live and commerce schedules, keeping repeat appearances and unknown times", () => {
    const schedules = [
      createBlankSchedule({ id: "merch", artist: "A", type: "merch", startTime: "11:00", endTime: "12:00" }),
      createBlankSchedule({ id: "live2", artist: "A", startTime: "16:00", endTime: "16:30" }),
      createBlankSchedule({ id: "live1", artist: " A ", startTime: "10:00", endTime: "10:30" }),
      createBlankSchedule({ id: "meet", artist: "A", type: "meet_and_greet", relativeTimeLabel: "終演後" }),
      createBlankSchedule({ id: "next", artist: "A", date: "2026-09-13", startTime: "09:00" }),
    ];
    const rows = groupArtistSchedules(document, schedules);
    expect(rows).toHaveLength(2);
    expect(rows[0].live.map((item) => item.id)).toEqual(["live1", "live2"]);
    expect(rows[0].commerce.map((item) => item.id)).toEqual(["merch", "meet"]);
    expect(rows[1].date).toBe("2026-09-13");
    expect(schedules[0].id).toBe("merch");
    expect(rows.flatMap((row) => [...row.live, ...row.commerce, ...row.other])).toHaveLength(5);
    expect(groupArtistSchedules(document, [schedules[0]])[0].live).toEqual([]);
  });

  it("orders rows by live time and keeps different names and unnamed schedules apart", () => {
    const rows = groupArtistSchedules(document, [
      createBlankSchedule({ artist: "A", type: "merch", startTime: "08:00" }),
      createBlankSchedule({ artist: "A", startTime: "12:00" }),
      createBlankSchedule({ artist: "B", startTime: "10:00" }),
      createBlankSchedule({ artist: "a", startTime: "13:00" }),
      createBlankSchedule(),
      createBlankSchedule(),
    ]);
    expect(rows).toHaveLength(5);
    expect(rows.slice(0, 3).map((row) => row.artist)).toEqual(["B", "A", "a"]);
  });

  it("preserves end times, next-day markers, relative times and missing values", () => {
    expect(
      timelineTimeLabel(
        createBlankSchedule({ startTime: "23:30", endTime: "00:15", endsNextDay: true }),
        "未定",
        "翌",
      ),
    ).toBe("23:30–翌00:15");
    expect(timelineTimeLabel(createBlankSchedule({ relativeTimeLabel: "終演後" }), "未定", "翌")).toBe(
      "終演後",
    );
    expect(timelineTimeLabel(createBlankSchedule(), "未定", "翌")).toBe("未定");
  });
});
