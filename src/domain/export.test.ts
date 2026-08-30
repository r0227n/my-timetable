import { describe, expect, it } from "vitest";
import { createBlankSchedule, createEmptyDocument } from "./timetable";
import {
  buildIcsCalendar,
  buildTimelineSvg,
  createExportFileName,
  isCalendarScheduleExportable,
} from "./export";

const scheduleTypeLabels = { live: "LIVE", meet_and_greet: "Meet & Greet", merch: "Merch", other: "Other" };
const exportLabels = {
  defaultTitle: "My Timetable",
  scheduleTypes: scheduleTypeLabels,
  timelineDescription: (count: number) => `Timeline with ${count} schedules`,
  untimed: "Time not set",
  unsetTime: "TBD",
  conflict: "Conflict",
  formatDate: (date: string) => date,
};

const document = {
  ...createEmptyDocument(),
  event: {
    ...createEmptyDocument().event,
    name: "Example / Festival",
    date: "2026-08-27",
    venue: "Main Hall",
    notes: ["Bring water"],
  },
  schedules: [
    createBlankSchedule({
      id: "artist-a",
      artist: "Artist <A>",
      type: "live",
      startTime: "10:00",
      endTime: "10:30",
      stage: "Stage 1",
    }),
  ],
};

describe("timeline export", () => {
  it("renders selected schedules as safe standalone SVG", () => {
    const svg = buildTimelineSvg(
      document,
      document.schedules,
      {
        width: 1080,
        height: 1350,
        background: "#ffffff",
        accent: "#df5d3d",
        title: "My Day",
        layout: "vertical",
        showDate: true,
        showVenue: true,
        showType: true,
        showStage: true,
        showBooth: true,
      },
      exportLabels,
    );

    expect(svg).toContain('viewBox="0 0 1080 1350"');
    expect(svg).toContain("Artist &lt;A&gt;");
    expect(svg).not.toContain("Artist <A>");
  });

  it("clips and shortens long card text inside the exported image", () => {
    const longSchedule = createBlankSchedule({
      id: "long-artist",
      artist: "A very long artist name that must stay within the schedule card boundary",
      startTime: "10:00",
      endTime: "10:30",
    });
    const svg = buildTimelineSvg(
      document,
      [longSchedule],
      {
        width: 320,
        height: 320,
        background: "#ffffff",
        accent: "#df5d3d",
        title: "Day",
        layout: "vertical",
        showDate: false,
        showVenue: false,
        showType: true,
        showStage: true,
        showBooth: true,
      },
      exportLabels,
    );

    expect(svg).toContain("clip-path=");
    expect(svg).toContain("…");
    expect(svg).not.toContain(longSchedule.artist);
  });

  it("creates a calendar with stable event details and excludes untimed schedules", () => {
    const untimed = createBlankSchedule({ id: "untimed", artist: "Later", relativeTimeLabel: "終演後" });
    const ics = buildIcsCalendar(document, [...document.schedules, untimed], scheduleTypeLabels);

    expect(ics).toContain("DTSTART;TZID=Asia/Tokyo:20260827T100000");
    expect(ics).toContain("DTEND;TZID=Asia/Tokyo:20260827T103000");
    expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
    expect(ics).toContain("CALSCALE:GREGORIAN");
    expect(ics).toContain("X-WR-TIMEZONE:Asia/Tokyo");
    expect(ics).toContain("SUMMARY:Artist <A> - LIVE");
    expect(ics).toContain("LOCATION:Stage 1");
    expect(ics).toContain("DESCRIPTION:Example / Festival\\nLIVE\\nBring water");
    expect(ics).toMatch(/UID:[0-9a-f]+@my-timetable/);
    expect(ics).not.toContain("Later");
  });

  it("creates a filesystem-safe default name", () => {
    expect(createExportFileName(document)).toBe("Example-Festival-2026-08-27-my-timetable");
  });

  it("advances the calendar end date for a schedule that crosses midnight", () => {
    const overnight = createBlankSchedule({
      id: "overnight",
      artist: "Late Show",
      startTime: "23:30",
      endTime: "00:30",
      endsNextDay: true,
    });

    const ics = buildIcsCalendar(document, [overnight], scheduleTypeLabels);

    expect(ics).toContain("DTSTART;TZID=Asia/Tokyo:20260827T233000");
    expect(ics).toContain("DTEND;TZID=Asia/Tokyo:20260828T003000");
  });

  it("uses per-schedule dates for a multi-day timetable", () => {
    const multiDay = { ...document, event: { ...document.event, date: null } };
    const schedules = [
      createBlankSchedule({
        id: "day-one",
        artist: "Day One",
        date: "2026-10-11",
        startTime: "10:00",
        endTime: "10:30",
      }),
      createBlankSchedule({
        id: "day-two",
        artist: "Day Two",
        date: "2026-10-12",
        startTime: "11:00",
        endTime: "11:30",
      }),
    ];

    const ics = buildIcsCalendar(multiDay, schedules, scheduleTypeLabels);

    expect(ics).toContain("DTSTART;TZID=Asia/Tokyo:20261011T100000");
    expect(ics).toContain("DTSTART;TZID=Asia/Tokyo:20261012T110000");
  });

  it("excludes an inferred end time until the schedule is verified", () => {
    const inferred = createBlankSchedule({
      artist: "Needs review",
      startTime: "10:00",
      endTime: "10:30",
      endTimeSource: "inferred_default",
      verified: false,
    });

    expect(buildIcsCalendar(document, [inferred], scheduleTypeLabels)).not.toContain("BEGIN:VEVENT");
    expect(buildIcsCalendar(document, [{ ...inferred, verified: true }], scheduleTypeLabels)).toContain(
      "BEGIN:VEVENT",
    );
  });

  it("classifies missing and unconfirmed schedules as initially excluded", () => {
    const missingDate = { ...document, event: { ...document.event, date: null } };
    const missingTime = createBlankSchedule({ startTime: null, endTime: "10:30" });
    const inferred = createBlankSchedule({
      date: "2026-08-30",
      startTime: "10:00",
      endTime: "10:30",
      endTimeSource: "inferred_default",
      verified: false,
    });

    expect(isCalendarScheduleExportable(missingTime, document)).toBe(false);
    expect(isCalendarScheduleExportable(inferred, missingDate)).toBe(false);
    expect(isCalendarScheduleExportable({ ...inferred, verified: true }, missingDate)).toBe(true);
  });

  it("positions timed cards on a constant time scale and separates simultaneous schedules", () => {
    const schedules = [
      createBlankSchedule({ id: "early", artist: "Early", startTime: "10:00", endTime: "10:20" }),
      createBlankSchedule({ id: "same", artist: "Same", startTime: "10:00", endTime: "10:30" }),
      createBlankSchedule({ id: "near", artist: "Near", startTime: "10:30", endTime: "11:00" }),
      createBlankSchedule({ id: "late", artist: "Late", startTime: "18:00", endTime: "18:30" }),
    ];
    const svg = buildTimelineSvg(
      document,
      schedules,
      {
        width: 1080,
        height: 1920,
        background: "#ffffff",
        accent: "#df5d3d",
        title: "My Day",
        layout: "vertical",
        showDate: true,
        showVenue: true,
        showType: true,
        showStage: true,
        showBooth: true,
      },
      exportLabels,
    );
    const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
    const position = (id: string, attribute: "x" | "y") =>
      Number(parsed.querySelector(`[data-schedule-id="${id}"] rect`)?.getAttribute(attribute));

    expect(position("near", "y") - position("early", "y")).toBeLessThan(
      position("late", "y") - position("near", "y"),
    );
    expect(position("same", "y")).toBe(position("early", "y"));
    expect(position("same", "x")).not.toBe(position("early", "x"));
  });
});
