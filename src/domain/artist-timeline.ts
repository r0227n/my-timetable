import { resolveScheduleDate, type ScheduleItem, type TimetableDocument } from "./timetable";

export interface ArtistTimelineRow {
  id: string;
  artist: string;
  date: string | null;
  live: ScheduleItem[];
  commerce: ScheduleItem[];
  other: ScheduleItem[];
}

/** Presentation grouping only; the underlying schedules remain independent calendar events. */
export function groupArtistSchedules(
  document: TimetableDocument,
  schedules: ScheduleItem[],
): ArtistTimelineRow[] {
  const rows = new Map<string, ArtistTimelineRow>();
  for (const schedule of schedules) {
    const artist = schedule.artist.trim();
    const date = resolveScheduleDate(document, schedule);
    const id = JSON.stringify([artist ? "artist" : "schedule", artist || schedule.id, date]);
    let row = rows.get(id);
    if (!row) {
      row = { id, artist, date, live: [], commerce: [], other: [] };
      rows.set(id, row);
    }
    const column = schedule.type === "live" ? row.live : schedule.type === "other" ? row.other : row.commerce;
    column.push(schedule);
  }
  for (const row of rows.values()) {
    for (const column of [row.live, row.commerce, row.other]) column.sort(compareTime);
  }
  return [...rows.values()].sort((a, b) => {
    const dateOrder = (a.date ?? "9999").localeCompare(b.date ?? "9999");
    const firstTime = (row: ArtistTimelineRow) =>
      row.live.find((item) => item.startTime)?.startTime ??
      [...row.commerce, ...row.other].filter((item) => item.startTime).sort(compareTime)[0]?.startTime ??
      "99:99";
    return dateOrder || firstTime(a).localeCompare(firstTime(b)) || a.artist.localeCompare(b.artist);
  });
}

function compareTime(a: ScheduleItem, b: ScheduleItem): number {
  return (
    (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99") ||
    (a.endTime ?? "99:99").localeCompare(b.endTime ?? "99:99")
  );
}

export function timelineTimeLabel(schedule: ScheduleItem, unset: string, nextDay: string): string {
  if (!schedule.startTime) return schedule.relativeTimeLabel || unset;
  return `${schedule.startTime}–${schedule.endsNextDay ? nextDay : ""}${schedule.endTime ?? unset}`;
}
