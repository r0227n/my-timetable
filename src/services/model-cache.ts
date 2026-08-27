import { clearOcrModelCache } from "@my-timetable/glm-ocr-web";
import { modelConfig } from "./model-config";

export async function clearAllModelCaches(): Promise<void> {
  await Promise.all([clearOcrModelCache(), caches.delete(modelConfig.structuring.cacheName)]);
}
