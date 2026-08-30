import type { ScheduleItem, TimetableDocument } from "./timetable";
import { resolveScheduleDate } from "./timetable";

const NEXT_START_CAP_MINUTES = 60;
const FINAL_SLOT_MINUTES = 30;

export function inferMissingEndTimes(document: TimetableDocument): TimetableDocument {
  const groups = new Map<string, ScheduleItem[]>();
  for (const schedule of document.schedules) {
    if (!schedule.startTime) continue;
    const lane = schedule.stage ?? schedule.booth ?? "";
    const key = `${resolveScheduleDate(document, schedule) ?? ""}\u0000${schedule.type}\u0000${lane}`;
    const group = groups.get(key) ?? [];
    group.push(schedule);
    groups.set(key, group);
  }

  const inferred = new Map<string, Pick<ScheduleItem, "endTime" | "endTimeSource" | "verified">>();
  for (const group of groups.values()) {
    const sorted = group.toSorted((left, right) => left.startTime!.localeCompare(right.startTime!));
    sorted.forEach((schedule, index) => {
      if (schedule.endTime) return;
      const start = timeToMinutes(schedule.startTime!);
      const next = sorted[index + 1];
      const nextStart = next ? timeToMinutes(next.startTime!) : null;
      const useNext = nextStart !== null && nextStart > start && nextStart - start <= NEXT_START_CAP_MINUTES;
      const end = useNext ? nextStart : start + (next ? NEXT_START_CAP_MINUTES : FINAL_SLOT_MINUTES);
      inferred.set(schedule.id, {
        endTime: minutesToTime(end),
        endTimeSource: useNext ? "inferred_next_start" : "inferred_default",
        verified: false,
      });
    });
  }

  return {
    ...document,
    schedules: document.schedules.map((schedule) => ({ ...schedule, ...inferred.get(schedule.id) })),
  };
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(value: number): string {
  const normalized = value % (24 * 60);
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}
