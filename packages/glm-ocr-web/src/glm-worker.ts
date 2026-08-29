/// <reference lib="webworker" />

import { GlmOcrEngine } from "./glm-engine";

const worker = self as DedicatedWorkerGlobalScope;
let controller: AbortController | null = null;

worker.onmessage = async (event: MessageEvent<{ type: "recognize"; image: Blob } | { type: "cancel" }>) => {
  if (event.data.type === "cancel") {
    controller?.abort();
    return;
  }

  controller = new AbortController();
  const engine = new GlmOcrEngine();
  try {
    const result = await engine.recognize(
      event.data.image,
      (progress) => worker.postMessage({ type: "progress", progress }),
      controller.signal,
    );
    worker.postMessage({ type: "result", result });
  } catch (error) {
    worker.postMessage({
      type: "error",
      name: error instanceof DOMException ? error.name : "Error",
      message: error instanceof Error ? error.message : "GLM-OCRに失敗しました。",
    });
  } finally {
    await engine.dispose();
    controller = null;
  }
};
