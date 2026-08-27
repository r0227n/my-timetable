import type { TimetableDocument } from "../domain/timetable";
import { createOcrEngine, type OcrProgress } from "@my-timetable/glm-ocr-web";
import type { GemmaProgress } from "./gemma";

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
  if (!ocrText.trim())
    throw new Error("画像から文字を読み取れませんでした。画像を調整するか、手入力をお試しください。");
  const { structureWithGemma } = await import("./gemma");
  const document = await structureWithGemma(
    ocrResult,
    (progress) => onUpdate({ step: "gemma", ...progress }),
    signal,
  );
  return { document, ocrText };
}
