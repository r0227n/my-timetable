/// <reference lib="webworker" />

import { GlmOcrEngine } from "./glm-engine";
import { OcrError, type OcrErrorCode } from "./types";

const worker = self as DedicatedWorkerGlobalScope;
let controller: AbortController | null = null;

worker.onmessage = async (event: MessageEvent<{ type: "recognize"; image: Blob } | { type: "cancel" }>) => {
  if (event.data.type === "cancel") {
    controller?.abort();
    return;
  }

  controller = new AbortController();
  const engine = new GlmOcrEngine();
  let response:
    | { type: "result"; result: Awaited<ReturnType<GlmOcrEngine["recognize"]>> }
    | { type: "error"; name: string; message: string; code?: OcrErrorCode };
  try {
    const result = await engine.recognize(
      event.data.image,
      (progress) => worker.postMessage({ type: "progress", progress }),
      controller.signal,
    );
    response = { type: "result", result };
  } catch (error) {
    response = {
      type: "error",
      name: error instanceof DOMException ? error.name : "Error",
      message: error instanceof Error ? error.message : "GLM-OCRに失敗しました。",
      ...(error instanceof OcrError ? { code: error.code } : {}),
    };
  }

  try {
    await engine.dispose();
  } catch (error) {
    response = {
      type: "error",
      name: "Error",
      message: error instanceof Error ? error.message : "GLM-OCRの解放に失敗しました。",
    };
  }
  controller = null;
  worker.postMessage(response);
};
