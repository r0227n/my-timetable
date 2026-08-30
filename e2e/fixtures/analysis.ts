import type { TimetableDocument } from "../../src/domain/timetable";
import type { AnalysisUpdate } from "../../src/services/analysis-contract";
import type { OcrResult } from "@my-timetable/glm-ocr-web";

const document: TimetableDocument = {
  schemaVersion: 3,
  event: {
    name: "TEST FESTIVAL 2026",
    date: "2026-09-12",
    timezone: "Asia/Tokyo",
    venue: null,
    openTime: null,
    startTime: null,
    notes: [],
  },
  schedules: [
    {
      id: "item-1",
      artist: "ALPHA",
      title: null,
      relationGroupId: null,
      type: "live",
      date: null,
      startTime: "10:00",
      endTime: "11:00",
      endTimeSource: "inferred_next_start",
      endsNextDay: false,
      relativeTimeLabel: null,
      stage: "STAGE A",
      booth: null,
      attributes: {},
      confidence: "low",
      verified: false,
      sourceRegions: [{ x: 0, y: 430, width: 300, height: 650 }],
    },
    {
      id: "item-2",
      artist: "ベータ",
      title: null,
      relationGroupId: null,
      type: "live",
      date: null,
      startTime: "11:00",
      endTime: "11:30",
      endTimeSource: "inferred_next_start",
      endsNextDay: false,
      relativeTimeLabel: null,
      stage: "STAGE B",
      booth: null,
      attributes: {},
      confidence: "high",
      verified: false,
      sourceRegions: [{ x: 0, y: 1080, width: 300, height: 340 }],
    },
    {
      id: "item-3",
      artist: "Idol A",
      title: null,
      relationGroupId: "relation-1",
      type: "live",
      date: null,
      startTime: "12:00",
      endTime: "12:20",
      endTimeSource: "explicit",
      endsNextDay: false,
      relativeTimeLabel: null,
      stage: "MAIN",
      booth: null,
      attributes: {},
      confidence: "high",
      verified: false,
      sourceRegions: [{ x: 300, y: 430, width: 300, height: 250 }],
    },
    {
      id: "item-4",
      artist: "Idol A",
      title: "物販・特典会",
      relationGroupId: "relation-1",
      type: "meet_and_greet",
      date: null,
      startTime: "12:40",
      endTime: "14:00",
      endTimeSource: "explicit",
      endsNextDay: false,
      relativeTimeLabel: null,
      stage: null,
      booth: "A",
      attributes: {},
      confidence: "high",
      verified: false,
      sourceRegions: [{ x: 300, y: 430, width: 300, height: 250 }],
    },
    {
      id: "item-5",
      artist: null,
      title: "終演後物販",
      relationGroupId: null,
      type: "merch",
      date: null,
      startTime: "21:35",
      endTime: "22:55",
      endTimeSource: "explicit",
      endsNextDay: false,
      relativeTimeLabel: null,
      stage: null,
      booth: null,
      attributes: {},
      confidence: "high",
      verified: false,
      sourceRegions: [{ x: 0, y: 1420, width: 600, height: 180 }],
    },
  ],
};

export async function analyzeTimetable(
  image: Blob,
  onUpdate: (update: AnalysisUpdate) => void,
  signal: AbortSignal,
): Promise<{ document: TimetableDocument; ocrResult: OcrResult }> {
  if (!image.type.startsWith("image/") || image.size === 0) throw new Error("E2E fixture requires an image");
  await update(onUpdate, { step: "ocr", stage: "model", progress: 0.25, message: "fake model" }, signal);
  await update(onUpdate, { step: "ocr", stage: "recognition", progress: 0.75, message: "fake OCR" }, signal);
  await update(onUpdate, { step: "gemma", progress: null }, signal);
  return {
    document,
    ocrResult: {
      text: "10:00 ALPHA\n11:00 ベータ\n12:00 Idol A\n物販・特典会 A 12:40〜14:00\n21:35〜22:55 終演後物販",
      engine: "glm-ocr",
      image: { width: 600, height: 1600 },
      regions: [
        {
          id: "alpha-region",
          kind: "column",
          text: "10:00 ALPHA",
          order: 0,
          confidence: 0.98,
          region: { x: 0, y: 430, width: 300, height: 650 },
        },
        {
          id: "beta-region",
          kind: "column",
          text: "11:00 ベータ",
          order: 1,
          confidence: 0.72,
          region: { x: 0, y: 1080, width: 300, height: 340 },
        },
      ],
    },
  };
}

async function update(
  onUpdate: (update: AnalysisUpdate) => void,
  value: AnalysisUpdate,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  onUpdate(value);
  await new Promise((resolve) => setTimeout(resolve, 75));
}
