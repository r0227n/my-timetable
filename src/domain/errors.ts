export const appErrorCodes = [
  "analysisFailed",
  "analysisNoText",
  "modelInitializationFailed",
  "ocrWebGpuRequired",
  "ocrInvalidInput",
  "ocrInvalidOutput",
  "ocrExecutionFailed",
  "ocrOutputIncomplete",
  "imageInvalidType",
  "imageTooLarge",
  "imageMultipleFiles",
  "imageProcessFailed",
  "imageGenerateFailed",
  "imageLoadFailed",
  "pngGenerateFailed",
  "svgToPngFailed",
  "icsDateRequired",
  "icsSaveFailed",
  "pngSaveFailed",
  "googleDateRequired",
  "googleAuthFailed",
  "googleAuthCancelled",
  "googleInsertFailed",
  "googleScriptLoadFailed",
  "googleRegistrationFailed",
  "gemmaWebGpuRequired",
  "gemmaInvalidJson",
  "gemmaInvalidData",
  "gemmaExecutionFailed",
  "gemmaStageCoverageIncomplete",
  "gemmaDownloadFailed",
  "gemmaDataFailed",
] as const;

export type AppErrorCode = (typeof appErrorCodes)[number];

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    public readonly details: Record<string, string | number> = {},
  ) {
    super(code);
    this.name = "AppError";
  }
}

export function errorCode(error: unknown, fallback: AppErrorCode): AppErrorCode {
  return error instanceof AppError ? error.code : fallback;
}

export function errorDetails(error: unknown): Record<string, string | number> {
  return error instanceof AppError ? error.details : {};
}
