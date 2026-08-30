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
import { inferMissingEndTimes } from "../domain/infer-end-times";

export interface GemmaProgress {
  progress: number | null;
}

const promptExample = {
  ...createEmptyDocument(),
  schedules: [createBlankSchedule({ id: "item-1" })],
};
const SYSTEM_PROMPT = `You convert OCR text from event timetable images into JSON.
Return JSON only. Never use markdown. Never invent a date, time, artist, venue, stage, or booth that is not present in the OCR input.
Use this exact shape: ${JSON.stringify(promptExample)}
Allowed type values: ${scheduleTypes.join(", ")}. Allowed confidence values: ${confidenceLevels.join(", ")}. Normalize certain times to 24-hour HH:mm. If text is unclear, use null or low confidence.
The OCR regions contain a full-image overview followed by detected left-to-right columns and include their source coordinates. Use the overview for shared headers and dates. Reconstruct each schedule within its column; never pair a time from one column with a name or stage from another column.
When a parent stage heading and a LEFT/RIGHT child heading both apply, set stage to "parent / child" using the exact text.
Preserve names, capitalization, spaces, punctuation, and symbols exactly as transcribed. Do not replace a name with outside knowledge.
If an explicit year and month/day are present in separate OCR regions for the same event/day, combine them into YYYY-MM-DD. Never infer a missing year from the current date.
For multi-day images set each schedule.date. Use event.date only as a single-day default.
Set endTime only when the OCR explicitly gives an end time. Set endTimeSource to explicit when it does; otherwise set endTime to null and endTimeSource to missing. Never infer duration.
Extract every independently named, timed timetable slot, including opening acts, DJs, talks, and other activities. Store non-performance slots as type other. Store DOOR OPEN and START as event metadata, not schedules.
The user message may include deterministic time-name candidates extracted from individual OCR regions. Treat every candidate as a separate schedule unless the OCR clearly identifies it as metadata. Copy candidate.text to artist exactly; do not leave artist empty when candidate.text is present. Return all candidates, not only the first one.
Do not create a schedule from a time-axis label alone. Omit a schedule when no artist or activity name can be paired with its time.
Copy the region coordinates that support each schedule into sourceRegions.`;

export async function structureWithGemma(
  ocrResult: OcrResult,
  onProgress: (progress: GemmaProgress) => void,
  signal: AbortSignal,
): Promise<TimetableDocument> {
  if (signal.aborted) throw new DOMException("解析を中止しました。", "AbortError");
  if (!navigator.gpu) throw new AppError("gemmaWebGpuRequired");
  onProgress({ progress: 0 });
  const modelStream = await loadModelStream(onProgress, signal);
  if (signal.aborted) throw new DOMException("Analysis aborted", "AbortError");

  configureLiteRtWasmAssets(modelConfig.structuring.runtimeUrl);
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
    return finalizeGemmaDocument(parseGemmaDocument(text), ocrResult);
  } finally {
    signal.removeEventListener("abort", cancel);
    try {
      await conversation?.delete();
    } finally {
      await engine.delete();
    }
  }
}

export function configureLiteRtWasmAssets(runtimeUrl: string): void {
  const workerGlobal = globalThis as typeof globalThis & {
    Module?: { locateFile?: (path: string) => string };
  };
  workerGlobal.Module = {
    locateFile: (path) => new URL(path, runtimeUrl).toString(),
  };
}

export function createGemmaUserPrompt(ocrResult: OcrResult): string {
  const ocrContext = JSON.stringify({ image: ocrResult.image, regions: ocrResult.regions });
  const candidates = JSON.stringify(extractTimedTextCandidates(ocrResult));
  return `次のOCR結果だけを根拠にJSONへ変換してください。timedTextCandidates は各OCR領域内で時刻の直後に名称がある明確な予定候補です。候補を省略せず、timeをstartTime、textをartistとして全件出力してください。\n\ntimedTextCandidates=${candidates}\n\nocrResult=${ocrContext}`;
}

export function finalizeGemmaDocument(document: TimetableDocument, ocrResult: OcrResult): TimetableDocument {
  const allowedRegions = new Set(
    ocrResult.regions.map(({ region }) => `${region.x}:${region.y}:${region.width}:${region.height}`),
  );
  const schedules = document.schedules.map((schedule) => ({ ...schedule }));
  for (const candidate of extractTimedTextCandidates(ocrResult)) {
    const regionKey = `${candidate.region.x}:${candidate.region.y}:${candidate.region.width}:${candidate.region.height}`;
    const match = schedules.find(
      (schedule) =>
        schedule.startTime === candidate.time &&
        (schedule.artist.trim() === "" ||
          (schedule.artist === candidate.text &&
            schedule.sourceRegions.some(
              (region) => `${region.x}:${region.y}:${region.width}:${region.height}` === regionKey,
            ))),
    );
    if (match) {
      if (match.artist.trim() === "") match.artist = candidate.text;
      if (
        !match.sourceRegions.some(
          (region) => `${region.x}:${region.y}:${region.width}:${region.height}` === regionKey,
        )
      ) {
        match.sourceRegions.push(candidate.region);
      }
      continue;
    }
    schedules.push(
      createBlankSchedule({
        artist: candidate.text,
        type: "live",
        startTime: candidate.time,
        confidence: "low",
        sourceRegions: [candidate.region],
      }),
    );
  }

  schedules.sort((left, right) => (left.startTime ?? "99:99").localeCompare(right.startTime ?? "99:99"));
  return inferMissingEndTimes({
    ...document,
    schedules: schedules.map((schedule, index) => ({
      ...schedule,
      id: `item-${index + 1}`,
      verified: false,
      sourceRegions: schedule.sourceRegions.filter((region) =>
        allowedRegions.has(`${region.x}:${region.y}:${region.width}:${region.height}`),
      ),
    })),
  });
}

interface TimedTextCandidate {
  time: string;
  text: string;
  region: OcrResult["regions"][number]["region"];
}

export function extractTimedTextCandidates(ocrResult: OcrResult): TimedTextCandidate[] {
  const candidatesByRegion = ocrResult.regions.map((ocrRegion) => ({
    kind: ocrRegion.kind,
    candidates: extractRegionCandidates(ocrRegion.text, ocrRegion.region),
  }));
  const columnCandidates = candidatesByRegion
    .filter(({ kind }) => kind === "column")
    .flatMap(({ candidates }) => candidates);
  return columnCandidates.length > 0
    ? columnCandidates
    : candidatesByRegion.flatMap(({ candidates }) => candidates);
}

function extractRegionCandidates(text: string, region: TimedTextCandidate["region"]): TimedTextCandidate[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && line !== "`" && !/^`?(?:text|json)$/i.test(line));
  const candidates: TimedTextCandidate[] = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    const match = lines[index]?.match(/^([01]\d|2[0-3]):([0-5]\d)(?:\s*(?:[~〜～-]|から))?$/);
    if (!match) continue;
    const followingText = lines[index + 1];
    if (!followingText || /^([01]\d|2[0-3]):[0-5]\d/.test(followingText)) continue;
    candidates.push({ time: `${match[1]}:${match[2]}`, text: followingText, region });
  }
  return candidates;
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
    const repaired = recoverJsonDocument(repairCommonJsonTypos(normalized));
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

function repairCommonJsonTypos(source: string): string {
  return source.replace(/((?:"x"|"y"|"width"|"height")\s*:\s*-?\d+(?:\.\d+)?)"(?=\s*[,}])/g, "$1");
}

function recoverJsonDocument(source: string): string | null {
  const objectStart = source.indexOf("{");
  if (objectStart < 0) return null;
  const stack: string[] = [];
  let recovered = "";
  let inString = false;
  let escaped = false;

  for (let index = objectStart; index < source.length; index += 1) {
    const character = source[index];
    recovered += character;
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
      const matchingIndex = stack.lastIndexOf(character);
      if (matchingIndex < 0) return null;
      while (stack.length - 1 > matchingIndex) recovered = recovered.slice(0, -1) + stack.pop() + character;
      stack.pop();
      if (stack.length === 0) return recovered;
    }
  }

  if (inString || stack.length === 0) return null;
  return recovered + stack.reverse().join("");
}

function normalizeGemmaValue(value: unknown): unknown {
  const document = asRecord(value);
  if (!document) return value;
  const event = asRecord(document.event) ?? {};
  const schedules = Array.isArray(document.schedules) ? document.schedules : [];

  return {
    schemaVersion: 2,
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
    date: validDateOrNull(schedule.date),
    startTime: validTimeOrNull(schedule.startTime),
    endTime: validTimeOrNull(schedule.endTime),
    endTimeSource: validTimeOrNull(schedule.endTime) ? "explicit" : "missing",
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
    sourceRegions: sourceRegions.map(normalizeSourceRegion).filter(isSourceRegion),
  };
}

function normalizeSourceRegion(value: unknown): unknown {
  const record = asRecord(value);
  return record && isSourceRegion(record.region) ? record.region : value;
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
