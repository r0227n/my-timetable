import { GLM_EXTERNAL_DATA, GLM_MODEL_ID, GLM_MODEL_REVISION } from "./config";
import { createModelProgressReporter } from "./model-progress";
import { OcrError, type OcrEngine, type OcrProgress, type OcrResult } from "./types";

const LOG_PREFIX = "[My Timetable][GLM-OCR]";

export class GlmOcrEngine implements OcrEngine {
  readonly kind = "glm-ocr" as const;
  private disposeModel: (() => Promise<unknown>) | null = null;

  async recognize(
    image: Blob,
    onProgress: (progress: OcrProgress) => void,
    signal: AbortSignal,
  ): Promise<OcrResult> {
    onProgress({ stage: "model", progress: null, message: "GLM-OCR実行環境を確認しています" });
    if (typeof navigator === "undefined" || !navigator.gpu) {
      throw new OcrError("webGpuRequired");
    }
    throwIfAborted(signal);

    const { AutoModelForImageTextToText, AutoProcessor, RawImage, env } =
      await import("@huggingface/transformers");
    const reportModelProgress = createModelProgressReporter(onProgress);
    const originalFetch = env.fetch;
    const abortableFetch: typeof env.fetch = (input, init = {}) => originalFetch(input, { ...init, signal });
    env.fetch = abortableFetch;
    const { processor, model } = await (async () => {
      try {
        console.info(`${LOG_PREFIX} プロセッサーを準備しています`, { model: GLM_MODEL_ID });
        const loadedProcessor = await waitForAbortable(
          AutoProcessor.from_pretrained(GLM_MODEL_ID, {
            revision: GLM_MODEL_REVISION,
            progress_callback: reportModelProgress,
          }),
          signal,
        );
        throwIfAborted(signal);
        console.info(`${LOG_PREFIX} プロセッサー準備完了`, { model: GLM_MODEL_ID });

        console.info(`${LOG_PREFIX} モデル取得とONNXセッション初期化を開始します`, {
          model: GLM_MODEL_ID,
        });
        const loadedModel = await waitForAbortable(
          AutoModelForImageTextToText.from_pretrained(GLM_MODEL_ID, {
            revision: GLM_MODEL_REVISION,
            device: "webgpu",
            dtype: {
              embed_tokens: "q4",
              decoder_model_merged: "q4",
              vision_encoder: "q4",
            },
            use_external_data_format: GLM_EXTERNAL_DATA,
            progress_callback: reportModelProgress,
          }),
          signal,
          async (lateModel) => {
            await lateModel.dispose();
          },
        );
        return { processor: loadedProcessor, model: loadedModel };
      } finally {
        if (env.fetch === abortableFetch) env.fetch = originalFetch;
      }
    })();
    console.info(`${LOG_PREFIX} ONNXセッション初期化完了`, { model: GLM_MODEL_ID });
    this.disposeModel = async () => {
      await model.dispose();
    };
    throwIfAborted(signal);

    onProgress({ stage: "recognition", progress: 0, message: "画像をGLM-OCR用に分割しています" });
    const rawImage = await RawImage.fromBlob(image);
    const sourceRegions = createOcrRegions(rawImage.width, rawImage.height);
    const recognizedRegions: OcrResult["regions"] = [];
    for (const [index, region] of sourceRegions.entries()) {
      throwIfAborted(signal);
      // oxlint-disable-next-line no-await-in-loop -- concurrent WebGPU inference would multiply peak memory.
      const regionImage = await rawImage.crop([
        region.x,
        region.y,
        region.x + region.width,
        region.y + region.height,
      ]);
      const prompt = processor.apply_chat_template(
        [
          {
            role: "user",
            content: [{ type: "image" }, { type: "text", text: "Text Recognition:" }],
          },
        ],
        { add_generation_prompt: true },
      );
      // oxlint-disable-next-line no-await-in-loop -- every region reuses one processor and model session.
      const inputs = await processor(prompt, regionImage, { add_special_tokens: false });
      // oxlint-disable-next-line no-await-in-loop -- generations stay sequential to bound GPU memory.
      const outputs = await model.generate({
        ...inputs,
        max_new_tokens: 512,
        do_sample: false,
      });
      throwIfAborted(signal);

      const promptLength = inputs.input_ids.dims.at(-1);
      if (promptLength === undefined) throw new OcrError("invalidInput");
      if (!("slice" in outputs) || typeof outputs.slice !== "function") {
        throw new OcrError("invalidOutput");
      }
      const decoded = processor.batch_decode(outputs.slice(null, [promptLength, null]), {
        skip_special_tokens: true,
      });
      const text = decoded[0]?.trim() ?? "";
      if (text) {
        recognizedRegions.push({ text, order: index, confidence: null, region });
      }
      onProgress({
        stage: "recognition",
        progress: (index + 1) / sourceRegions.length,
        message: `GLM-OCRで領域 ${index + 1}/${sourceRegions.length} を読み取っています`,
      });
    }
    const text = recognizedRegions.map((region) => region.text).join("\n");
    onProgress({ stage: "recognition", progress: 1, message: "文字認識が完了しました" });
    return {
      text,
      engine: this.kind,
      regions: recognizedRegions,
    };
  }

  async dispose(): Promise<void> {
    await this.disposeModel?.();
    this.disposeModel = null;
  }
}

export function createOcrRegions(width: number, height: number): OcrResult["regions"][number]["region"][] {
  const [columns, rows] = width >= height * 1.4 ? [4, 1] : height >= width * 1.4 ? [1, 4] : [2, 2];
  const regions = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = Math.round((column * width) / columns);
      const y = Math.round((row * height) / rows);
      const right = Math.round(((column + 1) * width) / columns);
      const bottom = Math.round(((row + 1) * height) / rows);
      regions.push({ x, y, width: right - x, height: bottom - y });
    }
  }
  return regions;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("解析を中止しました。", "AbortError");
}

function waitForAbortable<T>(
  operation: Promise<T>,
  signal: AbortSignal,
  disposeLateResult?: (result: T) => Promise<void>,
): Promise<T> {
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException("解析を中止しました。", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    void operation.then(
      (result) => {
        signal.removeEventListener("abort", abort);
        if (signal.aborted) {
          void disposeLateResult?.(result);
          return;
        }
        resolve(result);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        if (!signal.aborted) reject(error);
      },
    );
  });
}
