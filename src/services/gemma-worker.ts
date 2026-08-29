/// <reference lib="webworker" />

import type { OcrResult } from "@my-timetable/glm-ocr-web";
import { structureWithGemmaInWorker } from "./gemma";

const worker = self as DedicatedWorkerGlobalScope;
let controller: AbortController | null = null;

worker.onmessage = async (
  event: MessageEvent<{ type: "structure"; ocrResult: OcrResult } | { type: "cancel" }>,
) => {
  if (event.data.type === "cancel") {
    controller?.abort();
    return;
  }

  controller = new AbortController();
  try {
    const document = await structureWithGemmaInWorker(
      event.data.ocrResult,
      (progress) => worker.postMessage({ type: "progress", progress }),
      controller.signal,
    );
    worker.postMessage({ type: "result", document });
  } catch (error) {
    worker.postMessage({
      type: "error",
      name: error instanceof DOMException ? error.name : "Error",
      message: error instanceof Error ? error.message : "Gemmaによるデータ整形に失敗しました。",
    });
  } finally {
    controller = null;
  }
};
