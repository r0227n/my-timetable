import { GLM_EXTERNAL_DATA, GLM_MODEL_ID, GLM_MODEL_REVISION } from "./config";
import { createModelProgressReporter } from "./model-progress";
import { OcrError, type OcrEngine, type OcrProgress, type OcrResult } from "./types";

const LOG_PREFIX = "[My Timetable][GLM-OCR]";
const MAX_OCR_EDGE = 1280;
const MAX_OCR_PIXELS = 1_000_000;
const MAX_OCR_OUTPUT_TOKENS = 8192;
const FULL_TIMETABLE_PROMPT = "Table Recognition:";

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

    onProgress({ stage: "recognition", progress: 0, message: "画像全体をGLM-OCR用に準備しています" });
    const rawImage = await RawImage.fromBlob(image);
    const region = { x: 0, y: 0, width: rawImage.width, height: rawImage.height };
    let inputImage = rawImage;
    const boundedSize = fitOcrInputSize(inputImage.width, inputImage.height);
    if (boundedSize.width !== inputImage.width || boundedSize.height !== inputImage.height) {
      inputImage = await inputImage.resize(boundedSize.width, boundedSize.height);
    }
    const prompt = processor.apply_chat_template(
      [
        {
          role: "user",
          content: [
            { type: "image" },
            {
              type: "text",
              text: FULL_TIMETABLE_PROMPT,
            },
          ],
        },
      ],
      { add_generation_prompt: true },
    );
    const inputs = await processor(prompt, inputImage, { add_special_tokens: false });
    const outputs = await model.generate({
      ...inputs,
      max_new_tokens: MAX_OCR_OUTPUT_TOKENS,
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
    const recognizedText = decoded[0]?.trim() ?? "";
    const recognizedRegions: OcrResult["regions"] = recognizedText
      ? [
          {
            id: "full-image",
            kind: "overview",
            text: recognizedText,
            order: 0,
            confidence: null,
            region,
          },
        ]
      : [];
    const text = recognizedText ? `[full-image overview]\n${recognizedText}` : "";
    onProgress({ stage: "recognition", progress: 1, message: "文字認識が完了しました" });
    return {
      text,
      engine: this.kind,
      image: { width: rawImage.width, height: rawImage.height },
      regions: recognizedRegions,
    };
  }

  async dispose(): Promise<void> {
    await this.disposeModel?.();
    this.disposeModel = null;
  }
}

export function fitOcrInputSize(width: number, height: number): { width: number; height: number } {
  const edgeScale = MAX_OCR_EDGE / Math.max(width, height);
  const pixelScale = Math.sqrt(MAX_OCR_PIXELS / (width * height));
  const scale = Math.min(1, edgeScale, pixelScale);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
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
