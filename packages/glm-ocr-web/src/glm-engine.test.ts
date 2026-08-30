import { describe, expect, it, vi } from "vitest";
import { GLM_EXTERNAL_DATA, GLM_MODEL_ID, GLM_MODEL_REVISION, OCR_ENGINES } from "./config";
import { detectColumnBoundaries, fitOcrInputSize, GlmOcrEngine } from "./glm-engine";
import { createOcrEngine } from "./index";
import { createOcrRegions } from "./glm-engine";
import type { OcrProgress } from "./types";

describe("GLM-OCR engine configuration", () => {
  it.each([
    [800, 600, 800, 600],
    [1280, 781, 1280, 781],
    [1281, 100, 1280, 100],
    [2000, 1000, 1280, 640],
    [1240, 1754, 841, 1189],
    [100_000, 1, 1280, 1],
  ])("fits %ix%i within the OCR encoder limits as %ix%i", (width, height, expectedWidth, expectedHeight) => {
    const result = fitOcrInputSize(width, height);

    expect(result).toEqual({ width: expectedWidth, height: expectedHeight });
    expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(1280);
    expect(result.width * result.height).toBeLessThanOrEqual(1_000_000);
  });

  it("uses the complete, revision-pinned browser ONNX conversion", () => {
    expect(GLM_MODEL_ID).toBe("onnx-community/GLM-OCR-ONNX");
    expect(GLM_MODEL_REVISION).toMatch(/^[a-f0-9]{40}$/u);
    expect(GLM_EXTERNAL_DATA).toEqual({
      embed_tokens: true,
      decoder_model_merged: true,
      vision_encoder: true,
    });
    expect(OCR_ENGINES).toEqual([expect.objectContaining({ kind: "glm-ocr", available: true })]);
    expect(createOcrEngine().kind).toBe("glm-ocr");
  });

  it("rejects promptly when model loading is cancelled", async () => {
    vi.resetModules();
    Object.defineProperty(navigator, "gpu", { configurable: true, value: {} });
    let resolveProcessor: ((value: unknown) => void) | undefined;
    const processor = new Promise((resolve) => {
      resolveProcessor = resolve;
    });
    vi.doMock("@huggingface/transformers", () => ({
      AutoProcessor: { from_pretrained: () => processor },
      AutoModelForImageTextToText: { from_pretrained: vi.fn<() => Promise<never>>() },
      RawImage: { fromBlob: vi.fn<() => Promise<never>>() },
      env: { fetch: vi.fn<(input: string | URL, init?: unknown) => Promise<unknown>>() },
    }));
    const controller = new AbortController();
    const recognition = new GlmOcrEngine().recognize(
      new Blob(),
      vi.fn<(progress: OcrProgress) => void>(),
      controller.signal,
    );

    controller.abort();
    const outcome = await Promise.race([
      recognition.then(
        () => "resolved",
        (error: unknown) =>
          error instanceof DOMException && error.name === "AbortError" ? "aborted" : "failed",
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve("pending"), 25)),
    ]);
    resolveProcessor?.({});

    expect(outcome).toBe("aborted");
  });

  it("keeps the recognized text associated with its source region", async () => {
    vi.resetModules();
    Object.defineProperty(navigator, "gpu", { configurable: true, value: {} });
    const processor = Object.assign(
      vi.fn<(prompt: unknown, image: unknown, options: unknown) => { input_ids: { dims: number[] } }>(() => ({
        input_ids: { dims: [1, 4] },
      })),
      {
        apply_chat_template: vi.fn<() => string>(() => "prompt"),
        batch_decode: vi.fn<() => string[]>(() => ["Artist A 10:00"]),
      },
    );
    const slice = vi.fn<() => void>();
    const model = {
      dispose: vi.fn<() => Promise<void>>(async () => undefined),
      generate: vi.fn<() => { slice: typeof slice }>(() => ({ slice })),
    };
    vi.doMock("@huggingface/transformers", () => ({
      AutoProcessor: { from_pretrained: async () => processor },
      AutoModelForImageTextToText: { from_pretrained: async () => model },
      RawImage: {
        fromBlob: async () => ({ width: 1200, height: 800, crop: async () => ({ width: 600, height: 400 }) }),
      },
      env: { fetch: vi.fn<(input: string | URL, init?: unknown) => Promise<unknown>>() },
    }));

    const result = await new GlmOcrEngine().recognize(
      new Blob(),
      vi.fn<(progress: OcrProgress) => void>(),
      new AbortController().signal,
    );

    expect(result.image).toEqual({ width: 1200, height: 800 });
    expect(result.regions).toHaveLength(5);
    expect(result.regions[0]).toEqual({
      id: "overview",
      kind: "overview",
      text: "Artist A 10:00",
      order: 0,
      confidence: null,
      region: { x: 0, y: 0, width: 1200, height: 800 },
    });
  });

  it("bounds oversized crops before vision encoding to avoid std::bad_alloc", async () => {
    vi.resetModules();
    Object.defineProperty(navigator, "gpu", { configurable: true, value: {} });
    const processedImages: Array<{ width: number; height: number }> = [];
    const processor = Object.assign(
      vi.fn<
        (
          prompt: unknown,
          image: { width: number; height: number },
          options?: unknown,
        ) => { input_ids: { dims: number[] } }
      >((_prompt, image) => {
        processedImages.push(image);
        return { input_ids: { dims: [1, 4] } };
      }),
      {
        apply_chat_template: vi.fn<(...args: unknown[]) => string>(() => "prompt"),
        batch_decode: vi.fn<(...args: unknown[]) => string[]>(() => ["Artist A 10:00"]),
      },
    );
    const slice = vi.fn<(...args: unknown[]) => void>();
    const model = {
      dispose: vi.fn<() => Promise<void>>(async () => undefined),
      generate: vi.fn<(...args: unknown[]) => { slice: typeof slice }>(() => {
        const processedImage = processedImages.at(-1);
        if (
          Math.max(processedImage?.width ?? 0, processedImage?.height ?? 0) > 1280 ||
          (processedImage?.width ?? 0) * (processedImage?.height ?? 0) > 1_000_000
        ) {
          throw new Error("failed to call OrtRun(). ERROR_CODE: 6, ERROR_MESSAGE: std::bad_alloc");
        }
        return { slice };
      }),
    };
    const resize = vi.fn<(width: number, height: number) => Promise<{ width: number; height: number }>>(
      async (width, height) => ({ width, height }),
    );
    vi.doMock("@huggingface/transformers", () => ({
      AutoProcessor: { from_pretrained: async () => processor },
      AutoModelForImageTextToText: { from_pretrained: async () => model },
      RawImage: {
        fromBlob: async () => ({
          width: 1240,
          height: 1754,
          crop: async ([left, top, right, bottom]: number[]) => ({
            width: right - left,
            height: bottom - top,
            resize,
          }),
        }),
      },
      env: { fetch: vi.fn<(input: string | URL, init?: unknown) => Promise<unknown>>() },
    }));

    await expect(
      new GlmOcrEngine().recognize(
        new Blob(),
        vi.fn<(progress: OcrProgress) => void>(),
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ engine: "glm-ocr" });
    expect(resize).toHaveBeenCalled();
    expect(processedImages).toHaveLength(5);
    expect(processedImages).toEqual([
      { width: 841, height: 1189 },
      { width: 298, height: 1280 },
      { width: 371, height: 1280 },
      { width: 371, height: 1280 },
      { width: 298, height: 1280 },
    ]);
  });

  it("covers the complete image with ordered OCR regions", () => {
    expect(createOcrRegions(1000, 2000)).toEqual([
      { id: "overview", kind: "overview", region: { x: 0, y: 0, width: 1000, height: 2000 } },
      { id: "column-1", kind: "column", region: { x: 0, y: 0, width: 330, height: 2000 } },
      { id: "column-2", kind: "column", region: { x: 170, y: 0, width: 410, height: 2000 } },
      { id: "column-3", kind: "column", region: { x: 420, y: 0, width: 410, height: 2000 } },
      { id: "column-4", kind: "column", region: { x: 670, y: 0, width: 330, height: 2000 } },
    ]);
  });

  it("detects strong full-height timetable column boundaries", () => {
    const width = 300;
    const height = 100;
    const pixels = new Uint8ClampedArray(width * height * 3);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const value = x < 100 ? 20 : x < 200 ? 130 : 240;
        pixels.fill(value, (y * width + x) * 3, (y * width + x) * 3 + 3);
      }
    }

    const boundaries = detectColumnBoundaries(pixels, width, height, 3);

    expect(boundaries).toHaveLength(2);
    expect(boundaries[0]).toBeGreaterThanOrEqual(97);
    expect(boundaries[0]).toBeLessThanOrEqual(102);
    expect(boundaries[1]).toBeGreaterThanOrEqual(197);
    expect(boundaries[1]).toBeLessThanOrEqual(202);
  });
});
