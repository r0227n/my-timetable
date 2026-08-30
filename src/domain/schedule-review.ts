import { findInvalidTimeRangeIds } from "./conflicts";
import {
  resolveScheduleDate,
  scheduleDisplayName,
  type ScheduleItem,
  type TimetableDocument,
} from "./timetable";

export type ReviewFilter = "all" | "needs_review" | "verified";

export function isScheduleComplete(document: TimetableDocument, item: ScheduleItem): boolean {
  const hasTime = Boolean(item.startTime && item.endTime);
  const hasRelativeTime = Boolean(item.relativeTimeLabel?.trim()) && !item.startTime && !item.endTime;
  return (
    Boolean(scheduleDisplayName(item)) &&
    Boolean(resolveScheduleDate(document, item)) &&
    (hasRelativeTime || hasTime) &&
    !findInvalidTimeRangeIds([item]).has(item.id)
  );
}

export function canVerifySchedule(document: TimetableDocument, item: ScheduleItem): boolean {
  return isScheduleComplete(document, item);
}

export function needsReview(document: TimetableDocument, item: ScheduleItem): boolean {
  return !item.verified || item.confidence === "low" || !isScheduleComplete(document, item);
}

export function matchesReviewFilter(
  document: TimetableDocument,
  item: ScheduleItem,
  filter: ReviewFilter,
): boolean {
  if (filter === "needs_review") return needsReview(document, item);
  if (filter === "verified") return item.verified && isScheduleComplete(document, item);
  return true;
}

export function selectableSchedules(document: TimetableDocument): ScheduleItem[] {
  return document.schedules.filter((item) => item.verified && isScheduleComplete(document, item));
}
