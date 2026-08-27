import type { OcrProgress } from "./types";

const LOG_PREFIX = "[My Timetable][GLM-OCR]";
const LOG_INTERVAL_PERCENT = 10;

interface ProgressLogger {
  info(message: string, details: Record<string, string>): void;
}

export function createModelProgressReporter(
  onProgress: (progress: OcrProgress) => void,
  logger: ProgressLogger = console,
): (value: unknown) => void {
  const lastLoggedBucket = new Map<string, number>();

  return (value: unknown) => {
    const event = asProgressEvent(value);
    const progress = readDownloadProgress(event);
    onProgress({
      stage: "model",
      progress,
      message: progress === 1 ? "GLM-OCRモデルを準備しています" : "GLM-OCRモデルを取得しています",
    });

    if (!event) return;

    if (event.status === "progress") {
      const file = readString(event, "file");
      const percent = readNumber(event, "progress");
      if (file === null || percent === null) return;

      const bucket = Math.floor(clamp(percent, 0, 100) / LOG_INTERVAL_PERCENT);
      if (lastLoggedBucket.get(file) === bucket && percent < 100) return;
      lastLoggedBucket.set(file, bucket);

      logger.info(`${LOG_PREFIX} モデル取得 ${formatPercent(percent)}`, {
        file,
        loaded: formatBytes(readNumber(event, "loaded")),
        total: formatBytes(readNumber(event, "total")),
      });
      return;
    }

    if (event.status === "done") {
      const file = readString(event, "file");
      if (file !== null) logger.info(`${LOG_PREFIX} ファイル取得完了`, { file });
      return;
    }

    if (event.status === "ready") {
      const model = readString(event, "model");
      if (model !== null) logger.info(`${LOG_PREFIX} モデル準備完了`, { model });
    }
  };
}

function readDownloadProgress(event: Record<string, unknown> | null): number | null {
  if (!event) return null;
  if (event.status === "ready") return 1;
  if (event.status === "progress" || event.status === "progress_total") {
    const progress = readNumber(event, "progress");
    return progress === null ? null : clamp(progress / 100, 0, 1);
  }
  return null;
}

function asProgressEvent(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || !("status" in value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: Record<string, unknown>, key: string): string | null {
  return typeof value[key] === "string" ? value[key] : null;
}

function readNumber(value: Record<string, unknown>, key: string): number | null {
  return typeof value[key] === "number" && Number.isFinite(value[key]) ? value[key] : null;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function formatPercent(value: number): string {
  return `${clamp(value, 0, 100).toFixed(1)}%`;
}

function formatBytes(value: number | null): string {
  if (value === null) return "不明";
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}
