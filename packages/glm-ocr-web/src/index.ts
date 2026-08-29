import { GLM_CACHE_NAME } from "./config";
import { WorkerOcrEngine } from "./worker-engine";
import type { OcrEngine, OcrEngineKind } from "./types";

export { GLM_CACHE_NAME, OCR_ENGINES } from "./config";
export { OcrError } from "./types";
export type {
  OcrEngine,
  OcrEngineInfo,
  OcrEngineKind,
  OcrErrorCode,
  OcrProgress,
  OcrResult,
  OcrTextRegion,
} from "./types";

export function createOcrEngine(kind: OcrEngineKind = "glm-ocr"): OcrEngine {
  void kind;
  return new WorkerOcrEngine();
}

export async function clearOcrModelCache(): Promise<void> {
  await caches.delete(GLM_CACHE_NAME);
}
