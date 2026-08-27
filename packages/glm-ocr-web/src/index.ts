import { GlmOcrEngine } from "./glm-engine";
import { GLM_CACHE_NAME } from "./config";
import type { OcrEngine, OcrEngineKind } from "./types";

export { GLM_CACHE_NAME, OCR_ENGINES } from "./config";
export type { OcrEngine, OcrEngineInfo, OcrEngineKind, OcrProgress, OcrResult, OcrTextRegion } from "./types";

export function createOcrEngine(kind: OcrEngineKind = "glm-ocr"): OcrEngine {
  void kind;
  return new GlmOcrEngine();
}

export async function clearOcrModelCache(): Promise<void> {
  await caches.delete(GLM_CACHE_NAME);
}
