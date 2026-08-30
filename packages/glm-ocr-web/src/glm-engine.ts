import { GLM_EXTERNAL_DATA, GLM_MODEL_ID, GLM_MODEL_REVISION } from "./config";
import { createModelProgressReporter } from "./model-progress";
import { OcrError, type OcrEngine, type OcrProgress, type OcrResult } from "./types";

const LOG_PREFIX = "[My Timetable][GLM-OCR]";
const MAX_OCR_EDGE = 1280;
const MAX_OCR_PIXELS = 1_000_000;

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
    const sourceRegions = createOcrRegions(rawImage.width, rawImage.height, rawImage.data, rawImage.channels);
    const recognizedRegions: OcrResult["regions"] = [];
    for (const [index, sourceRegion] of sourceRegions.entries()) {
      const { region } = sourceRegion;
      throwIfAborted(signal);
      // oxlint-disable-next-line no-await-in-loop -- concurrent WebGPU inference would multiply peak memory.
      let regionImage = await rawImage.crop([
        region.x,
        region.y,
        region.x + region.width,
        region.y + region.height,
      ]);
      const boundedSize = fitOcrInputSize(regionImage.width, regionImage.height);
      if (boundedSize.width !== regionImage.width || boundedSize.height !== regionImage.height) {
        // oxlint-disable-next-line no-await-in-loop -- resized regions are processed sequentially to cap memory.
        regionImage = await regionImage.resize(boundedSize.width, boundedSize.height);
      }
      const instruction =
        sourceRegion.kind === "overview"
          ? "Read this event timetable overview. Transcribe only the event title, explicit year and dates, stage headings, venue, DOOR/OPEN time, and START time. Preserve their exact text and layout order. Do not transcribe artist or activity schedule rows from this overview."
          : "Transcribe this timetable column exactly from top to bottom. Preserve its date and stage headings, every explicit time or time range, artist/activity name, symbol, capitalization, and line break. Keep each logical timetable entry on its own line. Do not interpret, translate, correct, or omit repeated text.";
      const prompt = processor.apply_chat_template(
        [
          {
            role: "user",
            content: [
              { type: "image" },
              {
                type: "text",
                text: instruction,
              },
            ],
          },
        ],
        { add_generation_prompt: true },
      );
      // oxlint-disable-next-line no-await-in-loop -- every region reuses one processor and model session.
      const inputs = await processor(prompt, regionImage, { add_special_tokens: false });
      // oxlint-disable-next-line no-await-in-loop -- generations stay sequential to bound GPU memory.
      const outputs = await model.generate({
        ...inputs,
        max_new_tokens: sourceRegion.kind === "overview" ? 256 : 512,
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
        recognizedRegions.push({
          id: sourceRegion.id,
          kind: sourceRegion.kind,
          text,
          order: index,
          confidence: null,
          region,
        });
      }
      onProgress({
        stage: "recognition",
        progress: (index + 1) / sourceRegions.length,
        message: `GLM-OCRで領域 ${index + 1}/${sourceRegions.length} を読み取っています`,
      });
    }
    const text = recognizedRegions
      .map((recognized) => `[${recognized.id} ${recognized.kind}]\n${recognized.text}`)
      .join("\n\n");
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

export function createOcrRegions(
  width: number,
  height: number,
  pixels?: Uint8Array | Uint8ClampedArray,
  channels = 4,
): Array<Pick<OcrResult["regions"][number], "id" | "kind" | "region">> {
  const detected = pixels ? detectColumnBoundaries(pixels, width, height, channels) : [];
  const boundaries = detected.length
    ? [0, ...detected, width]
    : [0, 0.25, 0.5, 0.75, 1].map((x) => x * width);
  const overlap = Math.round(width * 0.08);
  const regions: Array<Pick<OcrResult["regions"][number], "id" | "kind" | "region">> = [
    {
      id: "overview",
      kind: "overview",
      region: { x: 0, y: 0, width, height },
    },
  ];
  for (let column = 0; column < boundaries.length - 1; column += 1) {
    const nominalLeft = Math.round(boundaries[column]);
    const nominalRight = Math.round(boundaries[column + 1]);
    const x = Math.max(0, nominalLeft - overlap);
    const right = Math.min(width, nominalRight + overlap);
    regions.push({
      id: `column-${column + 1}`,
      kind: "column",
      region: { x, y: 0, width: right - x, height },
    });
  }
  return regions;
}

export function detectColumnBoundaries(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  channels: number,
): number[] {
  if (width < 40 || height < 40 || pixels.length < width * height * channels) return [];
  const scores = new Float64Array(width);
  const yStart = Math.round(height * 0.18);
  const yStep = Math.max(1, Math.floor(height / 240));
  for (let x = 1; x < width; x += 1) {
    let score = 0;
    let samples = 0;
    for (let y = yStart; y < height; y += yStep) {
      const right = (y * width + x) * channels;
      const left = right - channels;
      score +=
        Math.abs(pixels[right] - pixels[left]) +
        Math.abs(pixels[right + 1] - pixels[left + 1]) +
        Math.abs(pixels[right + 2] - pixels[left + 2]);
      samples += 1;
    }
    scores[x] = score / Math.max(1, samples);
  }
  const smoothed = Array.from(scores, (_, x) => {
    let sum = 0;
    let count = 0;
    for (let offset = -2; offset <= 2; offset += 1) {
      if (scores[x + offset] === undefined) continue;
      sum += scores[x + offset];
      count += 1;
    }
    return sum / count;
  });
  const mean = smoothed.reduce((sum, value) => sum + value, 0) / smoothed.length;
  const deviation = Math.sqrt(
    smoothed.reduce((sum, value) => sum + (value - mean) ** 2, 0) / smoothed.length,
  );
  const threshold = mean + deviation * 1.5;
  const margin = width * 0.13;
  const minimumDistance = width * 0.08;
  const candidates = smoothed
    .map((score, x) => ({ score, x }))
    .filter(({ score, x }) => score >= threshold && x >= margin && x <= width - margin)
    .toSorted((left, right) => right.score - left.score);
  const selected: number[] = [];
  for (const candidate of candidates) {
    if (selected.every((x) => Math.abs(x - candidate.x) >= minimumDistance)) {
      selected.push(candidate.x);
    }
    if (selected.length === 7) break;
  }
  return selected.toSorted((left, right) => left - right);
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
