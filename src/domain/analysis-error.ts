import type { GemmaModelId } from "../services/gemma-model";
import { AppError, errorCode, type AppErrorCode } from "./errors";

export type AnalysisFailureStage = "environment" | "image" | "model" | "ocr" | "gemma" | "unknown";
export type AnalysisRetryTarget = "all" | "ocr" | "gemma" | "none";

export interface AnalysisFailure {
  code: AppErrorCode;
  stage: AnalysisFailureStage;
  retryTarget: AnalysisRetryTarget;
  retryCount: number;
  canContinueManually: boolean;
  diagnostics: string;
}

const publicCodes: Partial<Record<AppErrorCode, string>> = {
  analysisFailed: "ANALYSIS_UNEXPECTED",
  analysisNoText: "OCR_OUTPUT_EMPTY",
  modelInitializationFailed: "MODEL_INITIALIZATION_FAILED",
  imageProcessFailed: "IMAGE_PROCESSING_FAILED",
  imageGenerateFailed: "IMAGE_GENERATION_FAILED",
  imageLoadFailed: "IMAGE_LOAD_FAILED",
  ocrWebGpuRequired: "WEBGPU_UNAVAILABLE",
  ocrInvalidInput: "OCR_INPUT_INVALID",
  ocrInvalidOutput: "OCR_OUTPUT_INVALID",
  ocrExecutionFailed: "OCR_EXECUTION_FAILED",
  ocrOutputIncomplete: "OCR_OUTPUT_INCOMPLETE",
  gemmaWebGpuRequired: "WEBGPU_UNAVAILABLE",
  gemmaDownloadFailed: "MODEL_DOWNLOAD_FAILED",
  gemmaDataFailed: "MODEL_DATA_INVALID",
  gemmaExecutionFailed: "GEMMA_EXECUTION_FAILED",
  gemmaInvalidJson: "GEMMA_OUTPUT_NOT_JSON",
  gemmaInvalidData: "GEMMA_SCHEMA_INVALID",
  gemmaStageCoverageIncomplete: "GEMMA_STAGE_COVERAGE_INCOMPLETE",
};

export function describeAnalysisError(
  error: unknown,
  activeStage: AnalysisFailureStage,
  model: GemmaModelId,
  retryCount: number,
): AnalysisFailure {
  const rawCode = errorCode(error, "analysisFailed");
  const code =
    rawCode === "analysisFailed"
      ? activeStage === "gemma"
        ? "gemmaExecutionFailed"
        : activeStage === "ocr"
          ? "ocrExecutionFailed"
          : activeStage === "model"
            ? "modelInitializationFailed"
            : rawCode
      : rawCode;
  const stage = resolveStage(code, activeStage);
  const retryTarget = resolveRetryTarget(code, stage);
  const original =
    error instanceof Error && !(error instanceof AppError) ? sanitizeMessage(error.message) : null;
  const diagnostics = [
    `Code: ${publicCodes[code] ?? code.toUpperCase()}`,
    `Stage: ${stage}`,
    `Model: ${model}`,
    `Retry count: ${retryCount}`,
    `Browser: ${browserName()}`,
    `WebGPU: ${navigator.gpu ? "available" : "unavailable"}`,
    ...(original ? [`Exception: ${error instanceof Error ? error.name : "Error"}: ${original}`] : []),
  ].join("\n");

  return {
    code,
    stage,
    retryTarget,
    retryCount,
    canContinueManually: stage === "gemma",
    diagnostics,
  };
}

export function analysisPublicCode(code: AppErrorCode): string {
  return publicCodes[code] ?? code.toUpperCase();
}

function resolveStage(code: AppErrorCode, fallback: AnalysisFailureStage): AnalysisFailureStage {
  if (code === "ocrWebGpuRequired" || code === "gemmaWebGpuRequired") return "environment";
  if (code.startsWith("image")) return "image";
  if (code === "gemmaDownloadFailed" || code === "gemmaDataFailed") return "model";
  if (code === "modelInitializationFailed") return "model";
  if (code.startsWith("ocr") || code === "analysisNoText") return "ocr";
  if (code.startsWith("gemma")) return "gemma";
  return fallback;
}

function resolveRetryTarget(code: AppErrorCode, stage: AnalysisFailureStage): AnalysisRetryTarget {
  if (code === "ocrWebGpuRequired" || code === "gemmaWebGpuRequired") return "none";
  if (stage === "gemma") return "gemma";
  if (stage === "ocr") return "ocr";
  return "all";
}

function sanitizeMessage(message: string): string {
  return message.replace(/[\r\n]+/g, " ").slice(0, 200);
}

function browserName(): string {
  const agent = navigator.userAgent;
  if (agent.includes("Edg/")) return "Edge";
  if (agent.includes("Chrome/")) return "Chrome";
  if (agent.includes("Firefox/")) return "Firefox";
  if (agent.includes("Safari/")) return "Safari";
  return "Unknown";
}
