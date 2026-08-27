import { z } from "zod";

export const confidenceLevels = ["high", "medium", "low"] as const;
export const scheduleTypes = ["live", "meet_and_greet", "merch", "other"] as const;

export const confidenceSchema = z.enum(confidenceLevels);
export const scheduleTypeSchema = z.enum(scheduleTypes);

export const scheduleItemSchema = z.object({
  id: z.string().min(1),
  artist: z.string(),
  type: scheduleTypeSchema,
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  endTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  relativeTimeLabel: z.string().nullable(),
  stage: z.string().nullable(),
  booth: z.string().nullable(),
  attributes: z.record(z.string(), z.boolean().nullable()),
  confidence: confidenceSchema,
  verified: z.boolean(),
  sourceRegions: z.array(
    z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    }),
  ),
});

export const timetableDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  event: z.object({
    name: z.string(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    timezone: z.string().min(1),
    venue: z.string().nullable(),
    openTime: z.string().nullable(),
    startTime: z.string().nullable(),
    notes: z.array(z.string()),
  }),
  schedules: z.array(scheduleItemSchema),
});

export type Confidence = z.infer<typeof confidenceSchema>;
export type ScheduleType = z.infer<typeof scheduleTypeSchema>;
export type ScheduleItem = z.infer<typeof scheduleItemSchema>;
export type TimetableDocument = z.infer<typeof timetableDocumentSchema>;

export const scheduleTypeLabels: Record<ScheduleType, string> = {
  live: "LIVE",
  meet_and_greet: "特典会",
  merch: "物販",
  other: "その他",
};

export function createBlankSchedule(overrides: Partial<ScheduleItem> = {}): ScheduleItem {
  return {
    id: crypto.randomUUID(),
    artist: "",
    type: "live",
    startTime: null,
    endTime: null,
    relativeTimeLabel: null,
    stage: null,
    booth: null,
    attributes: {},
    confidence: "low",
    verified: false,
    sourceRegions: [],
    ...overrides,
  };
}

export function createEmptyDocument(): TimetableDocument {
  return {
    schemaVersion: 1,
    event: {
      name: "",
      date: null,
      timezone: "Asia/Tokyo",
      venue: null,
      openTime: null,
      startTime: null,
      notes: [],
    },
    schedules: [createBlankSchedule()],
  };
}
