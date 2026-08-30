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
  layout: "vertical" | "horizontal";
  showDate: boolean;
  showVenue: boolean;
  showType: boolean;
  showStage: boolean;
  showBooth: boolean;
}

export interface ExportLabels {
  defaultTitle: string;
  scheduleTypes: Record<ScheduleType, string>;
  timelineDescription: (count: number) => string;
  untimed: string;
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
  const layout = createTimelineLayout(schedules);
  const cards =
    options.layout === "horizontal"
      ? renderHorizontalCards(layout, width, height, options, labels)
      : renderVerticalCards(layout, width, height, options, labels);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">`,
    `<title id="title">${title}</title>`,
    `<desc id="description">${escapeXml(labels.timelineDescription(schedules.length))}</desc>`,
    `<rect width="${width}" height="${height}" fill="${escapeXml(options.background)}"/>`,
    `<rect width="12" height="${height}" fill="${escapeXml(options.accent)}"/>`,
    `<text x="${Math.round(width * 0.07)}" y="${Math.round(height * 0.09)}" font-family="system-ui, sans-serif" font-size="${Math.round(width * 0.045)}" font-weight="700" fill="#252722">${title}</text>`,
    subtitle
      ? `<text x="${Math.round(width * 0.07)}" y="${Math.round(height * 0.125)}" font-family="system-ui, sans-serif" font-size="${Math.round(width * 0.019)}" fill="#73756d">${escapeXml(subtitle)}</text>`
      : "",
    ...cards,
    `</svg>`,
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

interface TimelineEntry {
  schedule: ScheduleItem;
  start: number;
  end: number;
  lane: number;
}

interface TimelineLayout {
  timed: TimelineEntry[];
  untimed: ScheduleItem[];
  start: number;
  end: number;
  laneCount: number;
  conflictIds: Set<string>;
}

function createTimelineLayout(schedules: ScheduleItem[]): TimelineLayout {
  const candidates = schedules
    .flatMap((schedule) => {
      const start = timeToMinutes(schedule.startTime);
      if (start === null) return [];
      const parsedEnd = timeToMinutes(schedule.endTime);
      const end = parsedEnd === null ? null : parsedEnd + (schedule.endsNextDay ? 1440 : 0);
      return [{ schedule, start, end: end !== null && end > start ? end : start + 30 }];
    })
    .toSorted((first, second) => first.start - second.start || first.end - second.end);
  const laneEnds: number[] = [];
  const conflictIds = new Set<string>();
  const timed = candidates.map((entry, index): TimelineEntry => {
    const lane = laneEnds.findIndex((end) => end <= entry.start);
    const resolvedLane = lane === -1 ? laneEnds.length : lane;
    for (let previous = 0; previous < index; previous += 1) {
      const other = candidates[previous];
      if (other.end > entry.start) {
        conflictIds.add(other.schedule.id);
        conflictIds.add(entry.schedule.id);
      }
    }
    laneEnds[resolvedLane] = entry.end;
    return { ...entry, lane: resolvedLane };
  });
  return {
    timed,
    untimed: schedules.filter((schedule) => timeToMinutes(schedule.startTime) === null),
    start: timed.length ? Math.min(...timed.map((entry) => entry.start)) : 0,
    end: timed.length ? Math.max(...timed.map((entry) => entry.end)) : 60,
    laneCount: Math.max(1, laneEnds.length),
    conflictIds,
  };
}

function renderVerticalCards(
  layout: TimelineLayout,
  width: number,
  height: number,
  options: TimelineOptions,
  labels: ExportLabels,
): string[] {
  const top = height * 0.18;
  const untimedSpace = layout.untimed.length ? Math.min(height * 0.22, layout.untimed.length * 58 + 45) : 0;
  const availableHeight = Math.max(120, height * 0.76 - untimedSpace);
  const duration = Math.max(30, layout.end - layout.start);
  const laneGap = 8;
  const availableWidth = width * 0.86;
  const cardWidth = (availableWidth - laneGap * (layout.laneCount - 1)) / layout.laneCount;
  const cards = layout.timed.map(({ schedule, start, end, lane }) => {
    const x = width * 0.07 + lane * (cardWidth + laneGap);
    const y = top + ((start - layout.start) / duration) * availableHeight;
    const cardHeight = Math.max(52, ((end - start) / duration) * availableHeight - 4);
    return renderTimelineCard(
      schedule,
      x,
      y,
      cardWidth,
      cardHeight,
      options,
      labels,
      layout.conflictIds.has(schedule.id),
    );
  });
  if (layout.untimed.length) {
    const headingY = top + availableHeight + 28;
    cards.push(
      `<text x="${width * 0.07}" y="${headingY}" font-family="system-ui, sans-serif" font-size="18" font-weight="700" fill="#73756d">${escapeXml(labels.untimed)}</text>`,
    );
    layout.untimed.forEach((schedule, index) => {
      cards.push(
        renderTimelineCard(
          schedule,
          width * 0.07,
          headingY + 12 + index * 54,
          availableWidth,
          46,
          options,
          labels,
          false,
        ),
      );
    });
  }
  return cards;
}

function renderHorizontalCards(
  layout: TimelineLayout,
  width: number,
  height: number,
  options: TimelineOptions,
  labels: ExportLabels,
): string[] {
  const left = width * 0.07;
  const untimedSpace = layout.untimed.length ? Math.min(width * 0.22, layout.untimed.length * 150 + 80) : 0;
  const availableWidth = Math.max(180, width * 0.86 - untimedSpace);
  const duration = Math.max(30, layout.end - layout.start);
  const laneGap = 8;
  const availableHeight = height * 0.62;
  const cardHeight = (availableHeight - laneGap * (layout.laneCount - 1)) / layout.laneCount;
  const cards = layout.timed.map(({ schedule, start, end, lane }) => {
    const x = left + ((start - layout.start) / duration) * availableWidth;
    const y = height * 0.2 + lane * (cardHeight + laneGap);
    const cardWidth = Math.max(110, ((end - start) / duration) * availableWidth - 4);
    return renderTimelineCard(
      schedule,
      x,
      y,
      cardWidth,
      cardHeight,
      options,
      labels,
      layout.conflictIds.has(schedule.id),
    );
  });
  if (layout.untimed.length) {
    const x = left + availableWidth + 24;
    cards.push(
      `<text x="${x}" y="${height * 0.18}" font-family="system-ui, sans-serif" font-size="18" font-weight="700" fill="#73756d">${escapeXml(labels.untimed)}</text>`,
    );
    layout.untimed.forEach((schedule, index) => {
      cards.push(
        renderTimelineCard(
          schedule,
          x,
          height * 0.2 + index * 90,
          Math.max(120, untimedSpace - 32),
          78,
          options,
          labels,
          false,
        ),
      );
    });
  }
  return cards;
}

function renderTimelineCard(
  schedule: ScheduleItem,
  x: number,
  y: number,
  width: number,
  height: number,
  options: TimelineOptions,
  labels: ExportLabels,
  conflicting: boolean,
): string {
  const typeColors: Record<ScheduleItem["type"], string> = {
    live: options.accent,
    meet_and_greet: "#7567c7",
    merch: "#3c8b70",
    other: "#777777",
  };
  return [
    `<g data-schedule-id="${escapeXml(schedule.id)}">`,
    `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" rx="10" fill="#fcfaf5" stroke="#d8d2c5"/>`,
    `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="7" height="${height.toFixed(1)}" rx="3" fill="${escapeXml(typeColors[schedule.type])}"/>`,
    `<text x="${(x + 18).toFixed(1)}" y="${(y + 23).toFixed(1)}" font-family="system-ui, sans-serif" font-size="15" font-weight="700" fill="#252722">${escapeXml(`${schedule.startTime ?? schedule.relativeTimeLabel ?? labels.unsetTime} ${schedule.artist}`)}</text>`,
    `<text x="${(x + 18).toFixed(1)}" y="${(y + 43).toFixed(1)}" font-family="system-ui, sans-serif" font-size="11" fill="#73756d">${escapeXml(scheduleDetails(schedule, options, labels.scheduleTypes))}</text>`,
    conflicting
      ? `<text x="${(x + width - 24).toFixed(1)}" y="${(y + 23).toFixed(1)}" font-size="16" aria-label="${escapeXml(labels.conflict)}">⚠</text>`
      : "",
    `</g>`,
  ].join("");
}

function timeToMinutes(value: string | null): number | null {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
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
