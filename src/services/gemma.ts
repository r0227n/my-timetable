import {
  confidenceLevels,
  createBlankSchedule,
  createEmptyDocument,
  scheduleTypes,
  timetableDocumentSchema,
  type TimetableDocument,
} from "../domain/timetable";
import type { OcrResult } from "@my-timetable/glm-ocr-web";
import { modelConfig } from "./model-config";
import { AppError } from "../domain/errors";

export interface GemmaProgress {
  progress: number | null;
}

type GemmaWorkerResponse =
  | { type: "progress"; progress: GemmaProgress }
  | { type: "result"; document: TimetableDocument }
  | { type: "error"; name: string; message: string };

const promptExample = {
  ...createEmptyDocument(),
  schedules: [createBlankSchedule({ id: "item-1" })],
};
const SYSTEM_PROMPT = `You convert OCR text from event timetable images into JSON.
Return JSON only. Never use markdown. Never invent a date, time, artist, venue, stage, or booth that is not present in the OCR input.
Use this exact shape: ${JSON.stringify(promptExample)}
Allowed type values: ${scheduleTypes.join(", ")}. Allowed confidence values: ${confidenceLevels.join(", ")}. Normalize certain times to 24-hour HH:mm. If text is unclear, use null or low confidence.
Set event.date only when a complete YYYY-MM-DD date is explicit in the OCR input; otherwise use null.
Do not create a schedule from a time-axis label alone. Omit a schedule when no artist or activity name can be paired with its time.
Copy the region coordinates that support each schedule into sourceRegions.`;

export async function structureWithGemma(
  ocrResult: OcrResult,
  onProgress: (progress: GemmaProgress) => void,
  signal: AbortSignal,
): Promise<TimetableDocument> {
  if (signal.aborted) throw new DOMException("解析を中止しました。", "AbortError");
  const worker = new Worker(new URL("./gemma-worker.ts", import.meta.url), { type: "module" });
  return await new Promise<TimetableDocument>((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener("abort", cancel);
      worker.terminate();
    };
    const cancel = () => worker.postMessage({ type: "cancel" });
    signal.addEventListener("abort", cancel, { once: true });
    worker.onmessage = (event: MessageEvent<GemmaWorkerResponse>) => {
      const response = event.data;
      if (response.type === "progress") {
        onProgress(response.progress);
        return;
      }
      finish();
      if (response.type === "result") resolve(response.document);
      else if (response.name === "AbortError") reject(new DOMException(response.message, "AbortError"));
      else reject(new Error(response.message));
    };
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || "Gemma Workerでエラーが発生しました。"));
    };
    worker.postMessage({ type: "structure", ocrResult });
  });
}

export async function structureWithGemmaInWorker(
  ocrResult: OcrResult,
  onProgress: (progress: GemmaProgress) => void,
  signal: AbortSignal,
): Promise<TimetableDocument> {
  if (!navigator.gpu) throw new AppError("gemmaWebGpuRequired");
  onProgress({ progress: 0 });
  const modelStream = await loadModelStream(onProgress, signal);
  if (signal.aborted) throw new DOMException("Analysis aborted", "AbortError");

  const { Engine } = await import("@litert-lm/core");
  const engine = await Engine.create({
    model: modelStream,
    mainExecutorSettings: { maxNumTokens: 8192 },
  });
  let conversation: Awaited<ReturnType<typeof engine.createConversation>> | undefined;
  const cancel = () => conversation?.cancel();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    onProgress({ progress: null });
    conversation = await engine.createConversation({
      preface: { messages: [{ role: "system", content: SYSTEM_PROMPT }] },
    });
    const response = await conversation.sendMessage(createGemmaUserPrompt(ocrResult));
    const content = response.content;
    const text =
      typeof content === "string"
        ? content
        : (content ?? [])
            .filter((item): item is typeof item & { type: "text"; text: string } => item.type === "text")
            .map((item) => item.text)
            .join("");
    return parseGemmaDocument(text);
  } finally {
    signal.removeEventListener("abort", cancel);
    try {
      await conversation?.delete();
    } finally {
      await engine.delete();
    }
  }
}

export function createGemmaUserPrompt(ocrResult: OcrResult): string {
  const ocrContext = JSON.stringify({ text: ocrResult.text, regions: ocrResult.regions });
  return `次のOCR結果だけを根拠にJSONへ変換してください。\n\n${ocrContext}`;
}

export function parseGemmaDocument(raw: string): TimetableDocument {
  console.info("[My Timetable][Gemma] Raw result", raw);
  const normalized = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let value: unknown;
  try {
    value = JSON.parse(normalized);
  } catch {
    const repaired = recoverJsonDocument(normalized);
    if (!repaired) {
      throw new AppError("gemmaInvalidJson");
    }
    try {
      value = JSON.parse(repaired);
    } catch {
      throw new AppError("gemmaInvalidJson");
    }
  }
  const parsed = timetableDocumentSchema.safeParse(normalizeGemmaValue(value));
  if (!parsed.success) {
    throw new AppError("gemmaInvalidData");
  }
  console.info("[My Timetable][Gemma] Structured result", parsed.data);
  return parsed.data;
}

function recoverJsonDocument(source: string): string | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") stack.push("}");
    else if (character === "[") stack.push("]");
    else if (character === "}" || character === "]") {
      if (stack.pop() !== character) return null;
      if (stack.length === 0) return source.slice(0, index + 1);
    }
  }

  if (inString || stack.length === 0) return null;
  return source + stack.reverse().join("");
}

function normalizeGemmaValue(value: unknown): unknown {
  const document = asRecord(value);
  if (!document) return value;
  const event = asRecord(document.event) ?? {};
  const schedules = Array.isArray(document.schedules) ? document.schedules : [];

  return {
    schemaVersion: 1,
    event: {
      name: stringOr(event.name, ""),
      date: validDateOrNull(event.date),
      timezone: stringOr(event.timezone, "Asia/Tokyo") || "Asia/Tokyo",
      venue: nullableString(event.venue),
      openTime: validTimeOrNull(event.openTime),
      startTime: validTimeOrNull(event.startTime),
      notes: Array.isArray(event.notes)
        ? event.notes.filter((note): note is string => typeof note === "string")
        : [],
    },
    schedules: schedules.map((schedule, index) => normalizeSchedule(schedule, index)),
  };
}

function normalizeSchedule(value: unknown, index: number): Record<string, unknown> {
  const schedule = asRecord(value) ?? {};
  const attributes = asRecord(schedule.attributes) ?? {};
  const sourceRegions = Array.isArray(schedule.sourceRegions) ? schedule.sourceRegions : [];
  return {
    id: stringOr(schedule.id, `item-${index + 1}`) || `item-${index + 1}`,
    artist: stringOr(schedule.artist, ""),
    type: enumOr(schedule.type, scheduleTypes, "other"),
    startTime: validTimeOrNull(schedule.startTime),
    endTime: validTimeOrNull(schedule.endTime),
    endsNextDay: schedule.endsNextDay === true,
    relativeTimeLabel: nullableString(schedule.relativeTimeLabel),
    stage: nullableString(schedule.stage),
    booth: nullableString(schedule.booth),
    attributes: Object.fromEntries(
      Object.entries(attributes).filter(
        (entry): entry is [string, boolean | null] => typeof entry[1] === "boolean" || entry[1] === null,
      ),
    ),
    confidence: enumOr(schedule.confidence, confidenceLevels, "low"),
    verified: schedule.verified === true,
    sourceRegions: sourceRegions.filter(isSourceRegion),
  };
}

function enumOr<Value extends string>(value: unknown, allowed: readonly Value[], fallback: Value): Value {
  return typeof value === "string" && allowed.includes(value as Value) ? (value as Value) : fallback;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function validTimeOrNull(value: unknown): string | null {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;
}

function validDateOrNull(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function isSourceRegion(value: unknown): value is { x: number; y: number; width: number; height: number } {
  const region = asRecord(value);
  return Boolean(
    region &&
    [region.x, region.y, region.width, region.height].every(
      (coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate),
    ),
  );
}

async function loadModelStream(
  onProgress: (progress: GemmaProgress) => void,
  signal: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const { url, cacheName } = modelConfig.structuring;
  const cache = await caches.open(cacheName);
  let response = await cache.match(url);
  if (!response) {
    response = await fetch(url, { signal });
    if (!response.ok || !response.body) throw new AppError("gemmaDownloadFailed");
    void cache.put(url, response.clone()).catch(() => {
      // Quota pressure must not prevent a one-time in-memory inference.
    });
  }
  if (!response.body) throw new AppError("gemmaDataFailed");

  const total = Number(response.headers.get("content-length")) || 0;
  let loaded = 0;
  return response.body.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        loaded += chunk.byteLength;
        onProgress({
          progress: total ? loaded / total : null,
        });
        controller.enqueue(chunk);
      },
    }),
  );
}
