import { describe, expect, it } from "vitest";
import { AppError } from "./errors";
import { describeAnalysisError } from "./analysis-error";

describe("describeAnalysisError", () => {
  it("keeps the failing stage and exposes safe recovery metadata", () => {
    const failure = describeAnalysisError(
      new AppError("gemmaStageCoverageIncomplete", { missingStageCount: 2, privateOcrText: "secret" }),
      "gemma",
      "e2b",
      1,
    );

    expect(failure).toMatchObject({
      code: "gemmaStageCoverageIncomplete",
      stage: "gemma",
      retryTarget: "gemma",
      retryCount: 1,
      canContinueManually: true,
    });
    expect(failure.diagnostics).toContain("GEMMA_STAGE_COVERAGE_INCOMPLETE");
    expect(failure.diagnostics).not.toContain("secret");
    expect(failure.diagnostics).not.toContain("privateOcrText");
  });

  it("does not offer a retry for an unavailable WebGPU environment", () => {
    expect(describeAnalysisError(new AppError("ocrWebGpuRequired"), "ocr", "e2b", 0)).toMatchObject({
      stage: "environment",
      retryTarget: "none",
      canContinueManually: false,
    });
  });
});
