import type { TimetableDocument } from "../../src/domain/timetable";
import type { AnalysisUpdate } from "../../src/services/analysis-contract";
import type { OcrResult } from "@my-timetable/glm-ocr-web";

const document: TimetableDocument = {
  schemaVersion: 2,
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
      type: "live",
      date: null,
      startTime: "11:00",
      endTime: "11:30",
      endTimeSource: "inferred_next_start",
      endsNextDay: false,
      relativeTimeLabel: null,
      stage: "STAGE A",
      booth: null,
      attributes: {},
      confidence: "high",
      verified: false,
      sourceRegions: [{ x: 0, y: 1080, width: 300, height: 340 }],
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
      text: "10:00 ALPHA\n11:00 ベータ",
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
