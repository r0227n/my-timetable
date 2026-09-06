import { groupArtistSchedules, timelineTimeLabel, type ArtistTimelineRow } from "./artist-timeline";
import { detectConflicts } from "./conflicts";
import {
  resolveScheduleDate,
  type ScheduleItem,
  type ScheduleType,
  type TimetableDocument,
} from "./timetable";

export interface TimelineOptions {
  width: number;
  height: number;
  background: string;
  accent: string;
  title: string;
  showDate: boolean;
  showVenue: boolean;
  showType: boolean;
  showStage: boolean;
  showBooth: boolean;
}

export interface ExportLabels {
  defaultTitle: string;
  artist: string;
  commerce: string;
  nextDay: string;
  scheduleTypes: Record<ScheduleType, string>;
  timelineDescription: (count: number) => string;
  unsetTime: string;
  conflict: string;
  formatDate: (date: string, timeZone: string) => string;
}

export function buildTimelineSvg(
  document: TimetableDocument,
  schedules: ScheduleItem[],
  options: TimelineOptions,
  labels: ExportLabels,
): string {
  const width = Math.max(320, Math.round(options.width));
  const height = Math.max(320, Math.round(options.height));
  const title = escapeXml(options.title || document.event.name || labels.defaultTitle);
  const subtitle = [
    options.showDate && document.event.date
      ? labels.formatDate(document.event.date, document.event.timezone)
      : null,
    options.showVenue ? document.event.venue : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const rows = groupArtistSchedules(document, schedules);
  const conflicts = new Set(
    detectConflicts(schedules, 0, document.event.date).flatMap((item) => [item.firstId, item.secondId]),
  );
  const includeOther = rows.some((row) => row.other.length > 0);
  const rowHeights = rows.map((row) =>
    Math.max(132, Math.max(row.live.length, row.commerce.length, row.other.length) * 94 + 28),
  );
  const contentHeight = 230 + rowHeights.reduce((sum, value) => sum + value, 0);
  const scale = Math.min(width / 1080, height / contentHeight);
  const offset = (width - 1080 * scale) / 2;
  let y = 190;
  const cards = rows.map((row, index) => {
    const card = renderArtistRow(row, index, y, rowHeights[index], includeOther, options, labels, conflicts);
    y += rowHeights[index];
    return card;
  });
  const columns = includeOther ? [48, 320, 554, 788] : [48, 380, 700];
  const headings = [
    labels.artist,
    labels.scheduleTypes.live,
    labels.commerce,
    ...(includeOther ? [labels.scheduleTypes.other] : []),
  ];
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">`,
    `<title id="title">${title}</title>`,
    `<desc id="description">${escapeXml(labels.timelineDescription(schedules.length))}</desc>`,
    `<rect width="${width}" height="${height}" fill="${escapeXml(options.background)}"/>`,
    `<g transform="translate(${offset} 0) scale(${scale})">`,
    `<rect x="48" y="36" width="48" height="6" rx="3" fill="${escapeXml(options.accent)}"/>`,
    `<text x="48" y="96" font-family="system-ui, sans-serif" font-size="38" font-weight="700" fill="#182d2b">${escapeXml(truncateSvgText(options.title || document.event.name || labels.defaultTitle, 980, 38))}</text>`,
    `<text x="48" y="130" font-family="system-ui, sans-serif" font-size="19" fill="#596d69">${escapeXml(truncateSvgText(subtitle, 980, 19))}</text>`,
    ...headings.map(
      (heading, index) =>
        `<text x="${columns[index] + 16}" y="174" font-family="system-ui, sans-serif" font-size="19" font-weight="700" fill="#596d69">${escapeXml(heading)}</text>`,
    ),
    ...cards,
    `</g></svg>`,
  ].join("");
}

export function buildIcsCalendar(
  document: TimetableDocument,
  schedules: ScheduleItem[],
  scheduleTypeLabels: Record<ScheduleType, string>,
): string {
  const events = schedules.flatMap((schedule) => {
    const resolvedDate = resolveScheduleDate(document, schedule);
    if (
      !resolvedDate ||
      !schedule.startTime ||
      !schedule.endTime ||
      (!["explicit", "manual"].includes(schedule.endTimeSource) && !schedule.verified) ||
      (!schedule.endsNextDay && schedule.endTime <= schedule.startTime)
    )
      return [];
    const date = resolvedDate.replaceAll("-", "");
    const endDate = (schedule.endsNextDay ? addDays(resolvedDate, 1) : resolvedDate).replaceAll("-", "");
    const start = `${date}T${schedule.startTime.replace(":", "")}00`;
    const end = `${endDate}T${schedule.endTime.replace(":", "")}00`;
    const location = schedule.stage ?? schedule.booth ?? document.event.venue ?? "";
    const description = [document.event.name, scheduleTypeLabels[schedule.type], ...document.event.notes]
      .filter(Boolean)
      .join("\n");
    return [
      "BEGIN:VEVENT",
      `UID:${stableUid(document, schedule)}`,
      `DTSTAMP:${formatUtcTimestamp(new Date())}`,
      `DTSTART;TZID=${escapeIcs(document.event.timezone)}:${start}`,
      `DTEND;TZID=${escapeIcs(document.event.timezone)}:${end}`,
      `SUMMARY:${escapeIcs(`${schedule.artist} - ${scheduleTypeLabels[schedule.type]}`)}`,
      `LOCATION:${escapeIcs(location)}`,
      `DESCRIPTION:${escapeIcs(description)}`,
      "END:VEVENT",
    ];
  });
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "PRODID:-//My Timetable//NONSGML v1.0//EN",
    `X-WR-TIMEZONE:${escapeIcs(document.event.timezone)}`,
    ...events,
    "END:VCALENDAR",
  ];
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

export function isCalendarScheduleExportable(
  schedule: ScheduleItem,
  document?: TimetableDocument,
): schedule is ScheduleItem & { startTime: string; endTime: string } {
  return Boolean(
    (!document || resolveScheduleDate(document, schedule)) &&
    schedule.startTime &&
    schedule.endTime &&
    (["explicit", "manual"].includes(schedule.endTimeSource) || schedule.verified) &&
    (schedule.endsNextDay || schedule.endTime > schedule.startTime),
  );
}

function formatUtcTimestamp(value: Date): string {
  return value
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export function createExportFileName(document: TimetableDocument): string {
  const event = (document.event.name || "event")
    .normalize("NFKC")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-|-$/g, "");
  return `${event || "event"}-${document.event.date ?? "date-undecided"}-my-timetable`;
}

function renderArtistRow(
  row: ArtistTimelineRow,
  index: number,
  y: number,
  height: number,
  includeOther: boolean,
  options: TimelineOptions,
  labels: ExportLabels,
  conflicts: Set<string>,
): string {
  const columns = includeOther ? [48, 320, 554, 788, 1032] : [48, 380, 700, 1032];
  const clipId = `artist-row-${index}`;
  const result = [
    `<g data-artist-row="${escapeXml(row.id)}">`,
    `<title>${escapeXml(row.artist)}</title>`,
    `<defs><clipPath id="${clipId}"><rect x="48" y="${y}" width="984" height="${height}"/></clipPath></defs>`,
    `<rect x="48" y="${y}" width="984" height="${height}" fill="${index % 2 ? "#f1f5f4" : "#ffffff"}"/>`,
    `<rect x="48" y="${y + 16}" width="4" height="${height - 32}" rx="2" fill="${escapeXml(options.accent)}"/>`,
    `<g clip-path="url(#${clipId})">`,
    `<text x="64" y="${y + 44}" font-family="system-ui, sans-serif" font-size="25" font-weight="700" fill="#182d2b">${escapeXml(truncateSvgText(row.artist, columns[1] - 80, 25))}</text>`,
    options.showDate && row.date
      ? `<text x="64" y="${y + 77}" font-family="system-ui, sans-serif" font-size="18" fill="#596d69">${escapeXml(row.date)}</text>`
      : "",
  ];
  const cells = [row.live, row.commerce, ...(includeOther ? [row.other] : [])];
  cells.forEach((items, column) => {
    const x = columns[column + 1] + 16;
    const availableWidth = columns[column + 2] - x - 16;
    result.push(
      `<line x1="${x - 16}" x2="${x - 16}" y1="${y + 16}" y2="${y + height - 16}" stroke="#dce5e2"/>`,
    );
    if (!items.length) result.push(`<text x="${x}" y="${y + 44}" font-size="24" fill="#596d69">—</text>`);
    items.forEach((schedule, itemIndex) => {
      const top = y + 32 + itemIndex * 94;
      const time = timelineTimeLabel(schedule, labels.unsetTime, labels.nextDay);
      const details = scheduleDetails(schedule, options, labels.scheduleTypes);
      result.push(
        `<g data-schedule-id="${escapeXml(schedule.id)}">`,
        `<title>${escapeXml(`${row.artist} · ${labels.scheduleTypes[schedule.type]} · ${time} · ${details}`)}</title>`,
        `<text x="${x}" y="${top + 12}" font-family="system-ui, sans-serif" font-size="24" font-weight="650" fill="#182d2b">${escapeXml(truncateSvgText(time, availableWidth, 24))}</text>`,
        `<text x="${x}" y="${top + 40}" font-family="system-ui, sans-serif" font-size="17" fill="#596d69">${escapeXml(truncateSvgText(details, availableWidth, 17))}</text>`,
        conflicts.has(schedule.id)
          ? `<text x="${x}" y="${top + 63}" font-family="system-ui, sans-serif" font-size="16" fill="#a33223">⚠ ${escapeXml(labels.conflict)}</text>`
          : "",
        `</g>`,
      );
    });
  });
  result.push(`</g><line x1="48" x2="1032" y1="${y + height}" y2="${y + height}" stroke="#dce5e2"/></g>`);
  return result.join("");
}

function truncateSvgText(value: string, availableWidth: number, fontSize: number): string {
  const characters = [...value];
  const glyphWidth = (character: string) => fontSize * (/[^\u0020-\u007e]/u.test(character) ? 1.1 : 0.7);
  if (characters.reduce((sum, character) => sum + glyphWidth(character), 0) <= availableWidth) return value;
  let used = fontSize;
  let result = "";
  for (const character of characters) {
    const nextWidth = glyphWidth(character);
    if (used + nextWidth > availableWidth) break;
    used += nextWidth;
    result += character;
  }
  return `${result}…`;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function scheduleDetails(
  schedule: ScheduleItem,
  options: TimelineOptions,
  scheduleTypeLabels: Record<ScheduleType, string>,
): string {
  return [
    options.showType ? scheduleTypeLabels[schedule.type] : null,
    options.showStage ? schedule.stage : null,
    options.showBooth ? schedule.booth : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function stableUid(document: TimetableDocument, schedule: ScheduleItem): string {
  const source = `${document.event.name}|${resolveScheduleDate(document, schedule)}|${schedule.artist}|${schedule.startTime}|${schedule.type}`;
  let hash = 2_166_136_261;
  for (const character of source) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return `${(hash >>> 0).toString(16)}@my-timetable`;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    };
    return entities[character];
  });
}

function escapeIcs(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll(",", "\\,").replaceAll(";", "\\;");
}

function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let current = "";
  for (const character of line) {
    const limit = chunks.length === 0 ? 75 : 74;
    if (encoder.encode(current + character).length > limit) {
      chunks.push(current);
      current = character;
    } else {
      current += character;
    }
  }
  chunks.push(current);
  return chunks.join("\r\n ");
}
