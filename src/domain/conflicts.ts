import type { ScheduleItem } from "./timetable";

export interface ScheduleConflict {
  firstId: string;
  secondId: string;
  kind: "overlap" | "tight";
}

function minutes(value: string | null): number | null {
  if (!value) return null;
  const [hours, mins] = value.split(":").map(Number);
  return hours * 60 + mins;
}

export function detectConflicts(items: ScheduleItem[], bufferMinutes = 0): ScheduleConflict[] {
  const timed = items
    .map((item) => ({ item, start: minutes(item.startTime), end: minutes(item.endTime) }))
    .filter(
      (entry): entry is typeof entry & { start: number; end: number } =>
        entry.start !== null && entry.end !== null && entry.end > entry.start,
    )
    .toSorted((a, b) => a.start - b.start);

  const conflicts: ScheduleConflict[] = [];
  for (let i = 0; i < timed.length; i += 1) {
    for (let j = i + 1; j < timed.length; j += 1) {
      if (timed[j].start >= timed[i].end + bufferMinutes) break;
      const overlap = timed[j].start < timed[i].end;
      conflicts.push({
        firstId: timed[i].item.id,
        secondId: timed[j].item.id,
        kind: overlap ? "overlap" : "tight",
      });
    }
  }
  return conflicts;
}

export function findInvalidTimeRangeIds(items: ScheduleItem[]): Set<string> {
  return new Set(
    items
      .filter((item) => {
        const start = minutes(item.startTime);
        const end = minutes(item.endTime);
        return start !== null && end !== null && end <= start;
      })
      .map((item) => item.id),
  );
}

export function findDuplicateIds(items: ScheduleItem[]): Set<string> {
  const seen = new Map<string, string>();
  const duplicates = new Set<string>();
  for (const item of items) {
    const key = `${item.artist.trim().toLocaleLowerCase()}|${item.type}|${item.startTime ?? ""}|${item.endTime ?? ""}`;
    if (!item.artist.trim()) continue;
    const first = seen.get(key);
    if (first) {
      duplicates.add(first);
      duplicates.add(item.id);
    } else {
      seen.set(key, item.id);
    }
  }
  return duplicates;
}
