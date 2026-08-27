import { describe, expect, it, vi } from "vitest";
import { createBlankSchedule, createEmptyDocument } from "../domain/timetable";
import {
  registerSchedulesWithGoogleCalendar,
  selectFailedCalendarSchedules,
  type GoogleCalendarAdapter,
} from "./google-calendar";

describe("Google Calendar registration", () => {
  it("registers timed schedules and reports untimed schedules separately", async () => {
    const document = {
      ...createEmptyDocument(),
      event: { ...createEmptyDocument().event, name: "Festival", date: "2026-08-27", venue: "Hall" },
    };
    const timed = createBlankSchedule({
      id: "timed",
      artist: "Artist A",
      startTime: "10:00",
      endTime: "10:30",
      stage: "Stage 1",
    });
    const untimed = createBlankSchedule({ id: "untimed", artist: "Artist B" });
    const insertEvent = vi.fn<GoogleCalendarAdapter["insertEvent"]>(async () => undefined);
    const adapter: GoogleCalendarAdapter = {
      authorize: async () => "memory-only-token",
      insertEvent,
    };

    const results = await registerSchedulesWithGoogleCalendar(document, [timed, untimed], adapter);

    expect(insertEvent).toHaveBeenCalledWith(
      "memory-only-token",
      expect.objectContaining({
        summary: "Artist A - LIVE",
        start: { dateTime: "2026-08-27T10:00:00", timeZone: "Asia/Tokyo" },
      }),
    );
    expect(results).toEqual([{ scheduleId: "timed", success: true, message: "登録しました" }]);
  });

  it("selects only failed registerable schedules for retry", () => {
    const failed = createBlankSchedule({ id: "failed", startTime: "10:00", endTime: "10:30" });
    const succeeded = createBlankSchedule({ id: "succeeded", startTime: "11:00", endTime: "11:30" });
    const untimed = createBlankSchedule({ id: "untimed" });

    expect(
      selectFailedCalendarSchedules(
        [failed, succeeded, untimed],
        [
          { scheduleId: "failed", success: false, message: "failed" },
          { scheduleId: "succeeded", success: true, message: "ok" },
          { scheduleId: "untimed", success: false, message: "missing time" },
        ],
      ),
    ).toEqual([failed]);
  });
});
