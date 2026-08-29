import { describe, expect, it } from "vitest";
import { createBlankSchedule, createEmptyDocument } from "./timetable";
import { buildIcsCalendar, buildTimelineSvg, createExportFileName } from "./export";

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
    const svg = buildTimelineSvg(document, document.schedules, {
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
    });

    expect(svg).toContain('viewBox="0 0 1080 1350"');
    expect(svg).toContain("Artist &lt;A&gt;");
    expect(svg).not.toContain("Artist <A>");
  });

  it("creates a calendar with stable event details and excludes untimed schedules", () => {
    const untimed = createBlankSchedule({ id: "untimed", artist: "Later", relativeTimeLabel: "終演後" });
    const ics = buildIcsCalendar(document, [...document.schedules, untimed]);

    expect(ics).toContain("DTSTART;TZID=Asia/Tokyo:20260827T100000");
    expect(ics).toContain("DTEND;TZID=Asia/Tokyo:20260827T103000");
    expect(ics).toContain("SUMMARY:Artist <A> - LIVE");
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

    const ics = buildIcsCalendar(document, [overnight]);

    expect(ics).toContain("DTSTART;TZID=Asia/Tokyo:20260827T233000");
    expect(ics).toContain("DTEND;TZID=Asia/Tokyo:20260828T003000");
  });

  it("positions timed cards on a constant time scale and separates simultaneous schedules", () => {
    const schedules = [
      createBlankSchedule({ id: "early", artist: "Early", startTime: "10:00", endTime: "10:20" }),
      createBlankSchedule({ id: "same", artist: "Same", startTime: "10:00", endTime: "10:30" }),
      createBlankSchedule({ id: "near", artist: "Near", startTime: "10:30", endTime: "11:00" }),
      createBlankSchedule({ id: "late", artist: "Late", startTime: "18:00", endTime: "18:30" }),
    ];
    const svg = buildTimelineSvg(document, schedules, {
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
    });
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
