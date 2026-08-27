import type { TimetableDocument } from "../domain/timetable";
import { createOcrEngine, type OcrProgress } from "@my-timetable/glm-ocr-web";
import type { GemmaProgress } from "./gemma";
import { AppError } from "../domain/errors";

export type AnalysisUpdate = ({ step: "ocr" } & OcrProgress) | ({ step: "gemma" } & GemmaProgress);

export async function analyzeTimetable(
  image: Blob,
  onUpdate: (update: AnalysisUpdate) => void,
  signal: AbortSignal,
): Promise<{ document: TimetableDocument; ocrText: string }> {
  const engine = createOcrEngine("glm-ocr");
  let ocrResult;
  try {
    ocrResult = await engine.recognize(image, (progress) => onUpdate({ step: "ocr", ...progress }), signal);
  } finally {
    await engine.dispose();
  }
  const ocrText = ocrResult.text;
  console.info("[My Timetable][OCR] Result", {
    engine: ocrResult.engine,
    text: ocrText,
  });
  if (!ocrText.trim()) throw new AppError("analysisNoText");
  const { structureWithGemma } = await import("./gemma");
  const document = await structureWithGemma(
    ocrResult,
    (progress) => onUpdate({ step: "gemma", ...progress }),
    signal,
  );
  return { document, ocrText };
}
