import { describe, expect, it, vi } from "vitest";
import { GLM_EXTERNAL_DATA, GLM_MODEL_ID, GLM_MODEL_REVISION, OCR_ENGINES } from "./config";
import { GlmOcrEngine } from "./glm-engine";
import { createOcrEngine } from "./index";
import { createOcrRegions } from "./glm-engine";
import type { OcrProgress } from "./types";

describe("GLM-OCR engine configuration", () => {
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

    expect(result.regions).toHaveLength(4);
    expect(result.regions[0]).toEqual({
      text: "Artist A 10:00",
      order: 0,
      confidence: null,
      region: { x: 0, y: 0, width: 300, height: 800 },
    });
  });

  it("covers the complete image with ordered OCR regions", () => {
    expect(createOcrRegions(1000, 2000)).toEqual([
      { x: 0, y: 0, width: 1000, height: 500 },
      { x: 0, y: 500, width: 1000, height: 500 },
      { x: 0, y: 1000, width: 1000, height: 500 },
      { x: 0, y: 1500, width: 1000, height: 500 },
    ]);
  });
});
