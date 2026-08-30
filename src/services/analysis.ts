import type { TimetableDocument } from "../domain/timetable";
import { createOcrEngine, OcrError, type OcrProgress, type OcrResult } from "@my-timetable/glm-ocr-web";
import type { GemmaProgress } from "./gemma";
import { AppError } from "../domain/errors";

export type AnalysisUpdate = ({ step: "ocr" } & OcrProgress) | ({ step: "gemma" } & GemmaProgress);

export async function analyzeTimetable(
  image: Blob,
  onUpdate: (update: AnalysisUpdate) => void,
  signal: AbortSignal,
): Promise<{ document: TimetableDocument; ocrText: string }> {
  const ocrResult = await recognizeImage(image, (progress) => onUpdate({ step: "ocr", ...progress }), signal);
  const ocrText = ocrResult.text;
  if (!ocrText.trim()) throw new AppError("analysisNoText");
  const { structureWithGemma } = await import("./gemma");
  const document = await structureWithGemma(
    ocrResult,
    (progress) => onUpdate({ step: "gemma", ...progress }),
    signal,
  );
  return { document, ocrText };
}

export async function recognizeImage(
  image: Blob,
  onProgress: (progress: OcrProgress) => void,
  signal: AbortSignal,
): Promise<OcrResult> {
  const engine = createOcrEngine("glm-ocr");
  try {
    const result = await engine.recognize(image, onProgress, signal);
    console.info("[My Timetable][OCR] Result", { engine: result.engine, text: result.text });
    return result;
  } catch (error) {
    if (error instanceof OcrError) {
      const codes = {
        webGpuRequired: "ocrWebGpuRequired",
        invalidInput: "ocrInvalidInput",
        invalidOutput: "ocrInvalidOutput",
      } as const;
      throw new AppError(codes[error.code]);
    }
    throw error;
  } finally {
    await engine.dispose();
  }
}
