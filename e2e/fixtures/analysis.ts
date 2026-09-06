import type { TimetableDocument } from "../../src/domain/timetable";
import type { AnalysisGemmaProgress, AnalysisUpdate } from "../../src/services/analysis-contract";
import { AppError } from "../../src/domain/errors";
import type { GemmaModelId } from "../../src/services/gemma-model";
import type { OcrProgress, OcrResult } from "@my-timetable/glm-ocr-web";

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
      endTimeSource: "explicit",
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
      endTimeSource: "explicit",
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
  const ocrResult = await recognizeImage(image, (progress) => onUpdate({ step: "ocr", ...progress }), signal);
  const nextDocument = await structureOcrResult(
    ocrResult,
    (progress) => onUpdate({ step: "gemma", ...progress }),
    signal,
  );
  return { document: nextDocument, ocrResult };
}

export async function recognizeImage(
  image: Blob,
  onProgress: (progress: OcrProgress) => void,
  signal: AbortSignal,
): Promise<OcrResult> {
  const callCount = recordCall("ocr");
  if (!image.type.startsWith("image/") || image.size === 0) throw new Error("E2E fixture requires an image");
  await update(onProgress, { stage: "model", progress: 0.25, message: "fake model" }, signal);
  await update(onProgress, { stage: "recognition", progress: 0.75, message: "fake OCR" }, signal);
  const scenario = localStorage.getItem("e2e.analysisScenario");
  if (scenario === "ocr-error" || (scenario === "ocr-error-once" && callCount === 1)) {
    throw new AppError("ocrExecutionFailed");
  }
  return ocrResult;
}

export async function structureOcrResult(
  _ocrResult: OcrResult,
  onProgress: (progress: AnalysisGemmaProgress) => void,
  signal: AbortSignal,
  _gemmaModel: GemmaModelId = "e2b",
): Promise<TimetableDocument> {
  const callCount = recordCall("gemma");
  await update(onProgress, { progress: null }, signal);
  const scenario = localStorage.getItem("e2e.analysisScenario");
  if (scenario === "gemma-error" || (scenario === "gemma-error-once" && callCount === 1)) {
    throw new AppError("gemmaExecutionFailed");
  }
  return structuredClone(document);
}

const ocrResult: OcrResult = {
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
};

async function update<T>(onUpdate: (update: T) => void, value: T, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  onUpdate(value);
  await new Promise((resolve) => setTimeout(resolve, 75));
}

function recordCall(stage: "ocr" | "gemma"): number {
  const key = `e2e.${stage}Calls`;
  const count = Number(sessionStorage.getItem(key) ?? 0) + 1;
  sessionStorage.setItem(key, String(count));
  return count;
}
