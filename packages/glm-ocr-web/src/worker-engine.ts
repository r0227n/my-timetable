import type { OcrEngine, OcrProgress, OcrResult } from "./types";

type WorkerResponse =
  | { type: "progress"; progress: OcrProgress }
  | { type: "result"; result: OcrResult }
  | { type: "error"; name: string; message: string };

export class WorkerOcrEngine implements OcrEngine {
  readonly kind = "glm-ocr" as const;
  private worker: Worker | null = null;

  async recognize(
    image: Blob,
    onProgress: (progress: OcrProgress) => void,
    signal: AbortSignal,
  ): Promise<OcrResult> {
    if (signal.aborted) throw new DOMException("解析を中止しました。", "AbortError");
    if (this.worker) throw new Error("GLM-OCRはすでに実行中です。");

    const worker = new Worker(new URL("./glm-worker.ts", import.meta.url), { type: "module" });
    this.worker = worker;
    return await new Promise<OcrResult>((resolve, reject) => {
      const finish = () => {
        signal.removeEventListener("abort", cancel);
        worker.terminate();
        if (this.worker === worker) this.worker = null;
      };
      const cancel = () => worker.postMessage({ type: "cancel" });
      signal.addEventListener("abort", cancel, { once: true });
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const response = event.data;
        if (response.type === "progress") {
          onProgress(response.progress);
          return;
        }
        finish();
        if (response.type === "result") resolve(response.result);
        else if (response.name === "AbortError") reject(new DOMException(response.message, "AbortError"));
        else reject(new Error(response.message));
      };
      worker.onerror = (event) => {
        finish();
        reject(new Error(event.message || "GLM-OCR Workerでエラーが発生しました。"));
      };
      worker.postMessage({ type: "recognize", image });
    });
  }

  async dispose(): Promise<void> {
    this.worker?.postMessage({ type: "cancel" });
    this.worker?.terminate();
    this.worker = null;
  }
}
