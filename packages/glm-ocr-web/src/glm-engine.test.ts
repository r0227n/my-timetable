import { describe, expect, it, vi } from "vitest";
import { GLM_EXTERNAL_DATA, GLM_MODEL_ID, GLM_MODEL_REVISION, OCR_ENGINES } from "./config";
import { fitOcrInputSize, GlmOcrEngine } from "./glm-engine";
import { createOcrEngine } from "./index";
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

  it("processes the complete image with one model generation", async () => {
    vi.resetModules();
    Object.defineProperty(navigator, "gpu", { configurable: true, value: {} });
    const applyChatTemplate = vi.fn<() => string>(() => "prompt");
    const processor = Object.assign(
      vi.fn<(prompt: unknown, image: unknown, options: unknown) => { input_ids: { dims: number[] } }>(() => ({
        input_ids: { dims: [1, 4] },
      })),
      {
        apply_chat_template: applyChatTemplate,
        batch_decode: vi.fn<() => string[]>(() => ["Artist A 10:00"]),
      },
    );
    const slice = vi.fn<() => void>();
    const generate = vi.fn<() => { slice: typeof slice }>(() => ({ slice }));
    const model = {
      dispose: vi.fn<() => Promise<void>>(async () => undefined),
      generate,
    };
    vi.doMock("@huggingface/transformers", () => ({
      AutoProcessor: { from_pretrained: async () => processor },
      AutoModelForImageTextToText: { from_pretrained: async () => model },
      RawImage: {
        fromBlob: async () => ({ width: 1200, height: 800 }),
      },
      env: { fetch: vi.fn<(input: string | URL, init?: unknown) => Promise<unknown>>() },
    }));

    const result = await new GlmOcrEngine().recognize(
      new Blob(),
      vi.fn<(progress: OcrProgress) => void>(),
      new AbortController().signal,
    );

    expect(result.image).toEqual({ width: 1200, height: 800 });
    expect(processor).toHaveBeenCalledOnce();
    expect(applyChatTemplate).toHaveBeenCalledOnce();
    expect(applyChatTemplate.mock.calls[0]).toEqual([
      [
        expect.objectContaining({
          content: expect.arrayContaining([
            expect.objectContaining({
              type: "text",
              text: "Table Recognition:",
            }),
          ]),
        }),
      ],
      { add_generation_prompt: true },
    ]);
    expect(generate).toHaveBeenCalledOnce();
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ max_new_tokens: 8192 }));
    expect(result.regions).toHaveLength(1);
    expect(result.regions[0]).toEqual({
      id: "full-image",
      kind: "overview",
      text: "Artist A 10:00",
      order: 0,
      confidence: null,
      region: { x: 0, y: 0, width: 1200, height: 800 },
    });
  });

  it("bounds an oversized image before vision encoding to avoid std::bad_alloc", async () => {
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
        processedImages.push({ width: image.width, height: image.height });
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
          resize,
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
    expect(processedImages).toEqual([{ width: 841, height: 1189 }]);
  });
});
