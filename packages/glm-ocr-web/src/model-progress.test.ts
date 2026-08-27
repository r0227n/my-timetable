import { describe, expect, it, vi } from "vitest";
import { createModelProgressReporter } from "./model-progress";
import type { OcrProgress } from "./types";

describe("GLM-OCR model progress", () => {
  it("logs per-file byte progress without flooding the console", () => {
    const onProgress = vi.fn<(progress: OcrProgress) => void>();
    const info = vi.fn<(message: string, details: Record<string, string>) => void>();
    const report = createModelProgressReporter(onProgress, { info });
    const mib = 1024 * 1024;

    for (const progress of [1, 4, 9, 10, 15, 100]) {
      report({
        status: "progress",
        file: "onnx/vision_encoder_q4.onnx_data",
        progress,
        loaded: progress * mib,
        total: 100 * mib,
      });
    }

    expect(onProgress).toHaveBeenCalledTimes(6);
    expect(info).toHaveBeenCalledTimes(3);
    expect(info).toHaveBeenNthCalledWith(2, "[My Timetable][GLM-OCR] モデル取得 10.0%", {
      file: "onnx/vision_encoder_q4.onnx_data",
      loaded: "10.0 MiB",
      total: "100.0 MiB",
    });
  });

  it("logs completion and model readiness", () => {
    const info = vi.fn<(message: string, details: Record<string, string>) => void>();
    const report = createModelProgressReporter(vi.fn<(progress: OcrProgress) => void>(), { info });

    report({ status: "done", file: "tokenizer.json" });
    report({ status: "ready", model: "onnx-community/GLM-OCR-ONNX" });

    expect(info).toHaveBeenCalledWith("[My Timetable][GLM-OCR] ファイル取得完了", {
      file: "tokenizer.json",
    });
    expect(info).toHaveBeenCalledWith("[My Timetable][GLM-OCR] モデル準備完了", {
      model: "onnx-community/GLM-OCR-ONNX",
    });
  });
});
