import {
  confidenceLevels,
  createBlankSchedule,
  scheduleTypes,
  timetableDocumentSchema,
  type TimetableDocument,
} from "../domain/timetable";
import * as z from "zod";
import type { OcrResult } from "@my-timetable/glm-ocr-web";
import { gemmaModels } from "./model-config";
import type { GemmaModelId } from "./gemma-model";
import { AppError } from "../domain/errors";
import { inferMissingEndTimes } from "../domain/infer-end-times";

export interface GemmaProgress {
  progress: number | null;
}

const compactEventSchema = z.tuple([
  z.string(),
  z.string().nullable(),
  z.string().nullable(),
  z.string().nullable(),
  z.string().nullable(),
  z.array(z.string()),
]);
const compactScheduleSchema = z.tuple([
  z.string(),
  z.enum(scheduleTypes),
  z.string().nullable(),
  z.string().nullable(),
  z.string().nullable(),
  z.boolean(),
  z.string().nullable(),
  z.string().nullable(),
  z.string().nullable(),
  z.record(z.string(), z.boolean().nullable()),
  z.enum(confidenceLevels),
]);
const compactGemmaResultSchema = z.object({
  event: compactEventSchema,
  schedules: z.array(compactScheduleSchema),
});
const compactSuccessExample = {
  event: ["Festival", "2026-07-25", "Venue", null, null, []],
  schedules: [
    ["Artist A", "live", "2026-07-25", "10:00", "10:30", false, null, "Stage A", null, {}, "high"],
    ["Artist B", "live", "2026-07-25", "10:30", null, false, null, "Stage B", null, {}, "low"],
  ],
};
const SYSTEM_PROMPT = `You convert OCR text from event timetable images into compact JSON.
Return JSON only. Never use markdown. Never invent a date, time, artist, venue, stage, or booth that is not present in the OCR input.
This is a successful response. Match its JSON shape exactly: ${JSON.stringify(compactSuccessExample)}
The root object has exactly two keys: event and schedules.
event is exactly one six-value array: [eventName, date, venue, openTime, startTime, notes]. Never put schedule rows in event.
schedules is one array containing every schedule row. Each row is exactly [artist, type, date, startTime, endTime, endsNextDay, relativeTimeLabel, stage, booth, attributes, confidence].
Do not output schemaVersion, timezone, ids, endTimeSource, verified, sourceRegions, schedule field names, or any other keys. Never output schedule items as objects. The application adds omitted fields deterministically.
Allowed type values: ${scheduleTypes.join(", ")}. Allowed confidence values: ${confidenceLevels.join(", ")}. Normalize certain times to 24-hour HH:mm. If text is unclear, use null or low confidence.
The OCR result contains one full-image region. Reconstruct schedules from the preserved visual reading order and table relationships; never pair a time with a name or stage from an unrelated row or column.
The user message contains requiredStageHeadings extracted from the OCR STAGE_INDEX or stage sections. Return at least one schedule for every required stage heading. Every schedule.stage must include its exact parent stage heading; append an exact child heading as "parent / child" when applicable. Never stop after the first stage.
When a parent stage heading and a LEFT/RIGHT child heading both apply, set stage to "parent / child" using the exact text.
Preserve names, capitalization, spaces, punctuation, and symbols exactly as transcribed. Do not replace a name with outside knowledge.
If an explicit year and month/day are present in separate OCR regions for the same event/day, combine them into YYYY-MM-DD. Never infer a missing year from the current date.
For multi-day images set each schedule.date. Use event.date only as a single-day default.
Set endTime only when the OCR explicitly gives an end time; otherwise use null. Never infer duration.
Extract every independently named, timed timetable slot, including opening acts, DJs, talks, and other activities. Store non-performance slots as type other. Store DOOR OPEN and START as event metadata, not schedules.
The user message may include scheduleCandidates arrays in [artist, startTime, endTime, stage] order, deterministically extracted from the full-image OCR stage sections. Copy every candidate exactly into a separate schedule, including its complete parent / child stage. Return all candidates, not only the first one.
Do not create a schedule from a time-axis label alone. Omit a schedule when no artist or activity name can be paired with its time.`;
const JSON_RETRY_PROMPT = `前回の出力はJSON形式またはステージ網羅性を検証できませんでした。OCR入力を最初から見直し、requiredStageHeadingsの全ステージを省略せず、次の成功例と完全に同じevent/schedules形式の有効なJSONだけを返してください。eventは必ず1個の6要素配列、schedulesは予定行の配列です。各予定のstageには親ステージ見出しを正確に含めてください。予定行をeventへ入れたり、同じ予定を反復したりしないでください。説明、Markdown、コードフェンスは禁止です。成功例: ${JSON.stringify(compactSuccessExample)}`;

export async function structureWithGemma(
  ocrResult: OcrResult,
  onProgress: (progress: GemmaProgress) => void,
  signal: AbortSignal,
  modelId: GemmaModelId = "e2b",
): Promise<TimetableDocument> {
  if (signal.aborted) throw new DOMException("解析を中止しました。", "AbortError");
  if (!navigator.gpu) throw new AppError("gemmaWebGpuRequired");
  onProgress({ progress: 0 });
  const model = gemmaModels[modelId];
  const modelStream = await loadModelStream(model, onProgress, signal);
  if (signal.aborted) throw new DOMException("Analysis aborted", "AbortError");

  configureLiteRtWasmAssets(model.runtimeUrl);
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
    const createJsonConversation = () =>
      engine.createConversation({
        sessionConfig: {
          maxOutputTokens: 4096,
          samplerParams: { k: 1, seed: 0 },
        },
        preface: {
          messages: [{ role: "system" as const, content: SYSTEM_PROMPT }],
        },
      });
    conversation = await createJsonConversation();
    const initialPrompt = createGemmaUserPrompt(ocrResult);
    const sendAndParse = async (prompt: string): Promise<TimetableDocument> => {
      const response = await conversation!.sendMessage(prompt);
      const content = response.content;
      const text =
        typeof content === "string"
          ? content
          : (content ?? [])
              .filter((item): item is typeof item & { type: "text"; text: string } => item.type === "text")
              .map((item) => item.text)
              .join("");
      const document = parseGemmaResponse(text);
      if (
        findMissingStageHeadings(
          document,
          extractRequiredStageHeadings(ocrResult),
          extractTimedTextCandidates(ocrResult),
        ).length > 0
      ) {
        throw new AppError("gemmaStageCoverageIncomplete");
      }
      return document;
    };
    let document: TimetableDocument;
    try {
      document = await sendAndParse(initialPrompt);
    } catch (error) {
      if (
        !(error instanceof AppError) ||
        (error.code !== "gemmaInvalidJson" &&
          error.code !== "gemmaInvalidData" &&
          error.code !== "gemmaStageCoverageIncomplete")
      ) {
        throw error;
      }
      if (signal.aborted) throw new DOMException("Analysis aborted", "AbortError");
      await conversation.delete();
      conversation = await createJsonConversation();
      document = await sendAndParse(`${JSON_RETRY_PROMPT}\n\n${initialPrompt}`);
    }
    return finalizeGemmaDocument(document, ocrResult);
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
  const candidates = extractTimedTextCandidates(ocrResult);
  const requiredStageHeadings = JSON.stringify(extractRequiredStageHeadings(ocrResult));
  const structuredCandidates = candidates.filter(({ stage }) => stage !== null);
  if (structuredCandidates.length > 0) {
    const scheduleCandidates = JSON.stringify(
      structuredCandidates.map(({ text, time, endTime, stage }) => [text, time, endTime, stage]),
    );
    const ocrMetadata = JSON.stringify(extractOcrMetadata(ocrResult));
    return `次の全画像OCR結果から決定的に抽出した候補だけを根拠に、システムメッセージの成功例と同じ短いevent/schedules配列JSONへ変換してください。scheduleCandidatesの各配列は[artist,startTime,endTime,stage]です。全候補を1件ずつschedulesへコピーし、省略、統合、並べ替え、名称や時刻やstageの変更をしないでください。eventはocrMetadataから読み取れるイベント情報1件だけです。キー付きobjectではなく配列で返してください。\n\nrequiredStageHeadings=${requiredStageHeadings}\n\nscheduleCandidates=${scheduleCandidates}\n\nocrMetadata=${ocrMetadata}`;
  }
  const tableRows = ocrResult.regions.flatMap(({ text }) => extractHtmlTableRows(text));
  if (tableRows.length > 0) {
    const compactRows = JSON.stringify(
      tableRows.map((row) =>
        row.map(({ text, colspan, rowspan }) => {
          const spans = [colspan > 1 ? `c${colspan}` : "", rowspan > 1 ? `r${rowspan}` : ""]
            .filter(Boolean)
            .join(",");
          return spans ? `${text} [${spans}]` : text;
        }),
      ),
    );
    const ocrMetadata = JSON.stringify(extractOcrMetadata(ocrResult));
    return `次のtableRowsは画像全体を1回でOCRしたHTML表から、装飾属性を除いて行順を保った全セルです。各外側配列が表の1行、各文字列が左から右のセルです。[cN]はcolspan、[rN]はrowspanです。全行・全列を処理し、時刻と名称を同じ列の親ステージおよびLEFT/RIGHT子列に対応付けてください。システムメッセージの成功例と完全に同じevent/schedules配列JSONだけを返し、表の行配列をeventへ入れないでください。requiredStageHeadingsの全親ステージから予定を1件以上出力してください。\n\nrequiredStageHeadings=${requiredStageHeadings}\n\ntableRows=${compactRows}\n\nocrMetadata=${ocrMetadata}`;
  }
  const ocrContext = JSON.stringify({ image: ocrResult.image, regions: ocrResult.regions });
  const timedTextCandidates = JSON.stringify(candidates);
  return `次のOCR結果だけを根拠に、システムメッセージの成功例と同じ短いevent/schedules配列JSONへ変換してください。eventはイベント情報1件だけです。予定はすべてschedulesへ、キー付きobjectではなく配列で返してください。requiredStageHeadingsの全ステージを必ず処理し、各予定のstageへ対応する親ステージ見出しを含めてください。timedTextCandidates は時刻直後に名称がある明確な予定候補です。候補を省略せず、timeをstartTime、textをartistとして出力してください。\n\nrequiredStageHeadings=${requiredStageHeadings}\n\ntimedTextCandidates=${timedTextCandidates}\n\nocrResult=${ocrContext}`;
}

export function extractRequiredStageHeadings(ocrResult: OcrResult): string[] {
  const headings: string[] = [];
  const add = (heading: string) => {
    const normalized = heading.trim();
    if (normalized === "" || /^(?:LEFT|RIGHT)\s+STAGE$/iu.test(normalized)) return;
    if (!headings.includes(normalized)) headings.push(normalized);
  };
  const texts = [ocrResult.text, ...ocrResult.regions.map(({ text }) => text)];
  for (const text of texts) {
    for (const row of extractHtmlTableRows(text)) {
      for (const cell of row) {
        if (/(?:ステージ|STAGE)/iu.test(cell.text)) add(cell.text);
      }
    }
    for (const line of text.split(/\r?\n/u)) {
      const indexMatch = line.match(/^#\s*STAGE_INDEX:\s*(\[.*\])\s*$/iu);
      if (indexMatch?.[1]) {
        try {
          const values: unknown = JSON.parse(indexMatch[1]);
          if (Array.isArray(values)) {
            for (const value of values) if (typeof value === "string") add(value);
          }
        } catch {
          // Fall through to stage-section headings when the OCR index is malformed.
        }
      }
      const headingMatch = line.match(/^#{2,}\s*(?:STAGE\s*:\s*)?(.+?)\s*$/iu);
      const heading = headingMatch?.[1]?.trim();
      if (heading && !/^SECTION\s*:/iu.test(heading) && /(?:ステージ|STAGE)/iu.test(heading)) add(heading);
    }
  }
  return headings;
}

function findMissingStageHeadings(
  document: TimetableDocument,
  requiredStageHeadings: string[],
  candidates: TimedTextCandidate[] = [],
): string[] {
  const stages = [...document.schedules.map(({ stage }) => stage), ...candidates.map(({ stage }) => stage)]
    .map((stage) => stage?.replace(/\s+/gu, " ").trim().toLocaleLowerCase() ?? "")
    .filter(Boolean);
  return requiredStageHeadings.filter((required) => {
    const normalized = required.replace(/\s+/gu, " ").trim().toLocaleLowerCase();
    return !stages.some((stage) => stage.includes(normalized));
  });
}

export function finalizeGemmaDocument(document: TimetableDocument, ocrResult: OcrResult): TimetableDocument {
  const soleSourceRegion = ocrResult.regions.length === 1 ? ocrResult.regions[0]?.region : null;
  const allowedRegions = new Set(
    ocrResult.regions.map(({ region }) => `${region.x}:${region.y}:${region.width}:${region.height}`),
  );
  const schedules = document.schedules.map((schedule) => ({ ...schedule }));
  for (const candidate of extractTimedTextCandidates(ocrResult)) {
    const regionKey = `${candidate.region.x}:${candidate.region.y}:${candidate.region.width}:${candidate.region.height}`;
    const match = schedules.find(
      (schedule) =>
        schedule.startTime === candidate.time &&
        (schedule.artist.trim() === "" || schedule.artist === candidate.text) &&
        (!candidate.stage || !schedule.stage || schedule.stage === candidate.stage),
    );
    if (match) {
      if (match.artist.trim() === "") match.artist = candidate.text;
      if (!match.stage && candidate.stage) match.stage = candidate.stage;
      if (!match.endTime && candidate.endTime) {
        match.endTime = candidate.endTime;
        match.endTimeSource = "explicit";
      }
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
        endTime: candidate.endTime,
        stage: candidate.stage,
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
      sourceRegions: soleSourceRegion
        ? [soleSourceRegion]
        : schedule.sourceRegions.filter((region) =>
            allowedRegions.has(`${region.x}:${region.y}:${region.width}:${region.height}`),
          ),
    })),
  });
}

interface TimedTextCandidate {
  time: string;
  endTime: string | null;
  text: string;
  stage: string | null;
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
  const htmlCandidates = extractHtmlTableCandidates(text, region);
  if (htmlCandidates.length > 0) return htmlCandidates;
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && line !== "`" && !/^`?(?:text|json)$/i.test(line));
  const candidates: TimedTextCandidate[] = [];
  let parentStage: string | null = null;
  let childStage: string | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const stageMatch = line.match(/^##\s*STAGE\s*:\s*(.+?)\s*$/iu);
    if (stageMatch?.[1]) {
      parentStage = stageMatch[1].trim();
      childStage = null;
      continue;
    }
    const sectionMatch = line.match(/^#{3,}\s*SECTION\s*:\s*(.*?)\s*$/iu);
    if (sectionMatch) {
      const section = sectionMatch[1]?.trim() ?? "";
      childStage = section === "" || section === "-" ? null : section;
      continue;
    }
    const genericHeading = line.match(/^#{2,}\s*(.+?)\s*$/u)?.[1]?.trim();
    if (genericHeading) {
      if (/^(?:LEFT|RIGHT)\s+STAGE$/iu.test(genericHeading)) {
        childStage = genericHeading;
      } else if (/(?:ステージ|STAGE)/iu.test(genericHeading)) {
        parentStage = genericHeading;
        childStage = null;
      }
      continue;
    }
    const rowMatch = line.match(
      /^-\s*([01]\d|2[0-3]):([0-5]\d)(?:\s*[-–—~〜～]\s*([01]\d|2[0-3]):([0-5]\d))?\s*\|\s*(.+)$/u,
    );
    if (rowMatch?.[1] && rowMatch[2] && rowMatch[5]) {
      candidates.push({
        time: `${rowMatch[1]}:${rowMatch[2]}`,
        endTime: rowMatch[3] && rowMatch[4] ? `${rowMatch[3]}:${rowMatch[4]}` : null,
        text: rowMatch[5].trim(),
        stage: parentStage ? (childStage ? `${parentStage} / ${childStage}` : parentStage) : null,
        region,
      });
      continue;
    }
    const timeMatch = line.match(
      /^-?\s*([01]\d|2[0-3]):([0-5]\d)(?:\s*[-–—~〜～]\s*(?:([01]\d|2[0-3]):([0-5]\d))?)?\s*$/u,
    );
    if (!timeMatch?.[1] || !timeMatch[2]) continue;
    const followingText = lines[index + 1]?.replace(/^-\s*/u, "").trim();
    if (
      !followingText ||
      /^#{1,}\s/u.test(followingText) ||
      /^(?:[01]\d|2[0-3]):[0-5]\d/u.test(followingText)
    ) {
      continue;
    }
    candidates.push({
      time: `${timeMatch[1]}:${timeMatch[2]}`,
      endTime: timeMatch[3] && timeMatch[4] ? `${timeMatch[3]}:${timeMatch[4]}` : null,
      text: followingText,
      stage: parentStage ? (childStage ? `${parentStage} / ${childStage}` : parentStage) : null,
      region,
    });
    index += 1;
  }
  return candidates;
}

interface HtmlTableCell {
  text: string;
  colspan: number;
  rowspan: number;
}

function extractHtmlTableRows(text: string): HtmlTableCell[][] {
  if (!/<table\b/iu.test(text)) return [];
  const rows: HtmlTableCell[][] = [];
  for (const rowMatch of text.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/giu)) {
    const cells: HtmlTableCell[] = [];
    for (const cellMatch of (rowMatch[1] ?? "").matchAll(/<t[hd]\b([^>]*)>([\s\S]*?)<\/t[hd]\s*>/giu)) {
      const attributes = cellMatch[1] ?? "";
      cells.push({
        text: normalizeHtmlCellText(cellMatch[2] ?? ""),
        colspan: readHtmlSpan(attributes, "colspan"),
        rowspan: readHtmlSpan(attributes, "rowspan"),
      });
    }
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

function extractHtmlTableCandidates(
  text: string,
  region: TimedTextCandidate["region"],
): TimedTextCandidate[] {
  const rows = extractHtmlTableRows(text);
  if (rows.length === 0) return [];
  const grid: Array<Array<HtmlTableCell | undefined>> = [];
  const parentStageByColumn: Array<string | undefined> = [];
  const childStageByColumn: Array<string | undefined> = [];
  const candidates: TimedTextCandidate[] = [];

  rows.forEach((cells, rowIndex) => {
    const gridRow = (grid[rowIndex] ??= []);
    let column = 0;
    for (const cell of cells) {
      while (gridRow[column]) column += 1;
      const startColumn = column;
      for (let rowOffset = 0; rowOffset < cell.rowspan; rowOffset += 1) {
        const occupiedRow = (grid[rowIndex + rowOffset] ??= []);
        for (let columnOffset = 0; columnOffset < cell.colspan; columnOffset += 1) {
          occupiedRow[startColumn + columnOffset] = cell;
        }
      }

      if (/^(?:LEFT|RIGHT)\s+STAGE$/iu.test(cell.text)) {
        for (let offset = 0; offset < cell.colspan; offset += 1) {
          childStageByColumn[startColumn + offset] = cell.text;
        }
      } else if (/(?:ステージ|STAGE)/iu.test(cell.text)) {
        for (let offset = 0; offset < cell.colspan; offset += 1) {
          parentStageByColumn[startColumn + offset] = cell.text;
          childStageByColumn[startColumn + offset] = undefined;
        }
      } else {
        const timed = parseTimedHtmlCell(cell.text);
        if (timed) {
          const parentStage = parentStageByColumn[startColumn];
          const childStage = childStageByColumn[startColumn];
          candidates.push({
            ...timed,
            stage: parentStage ? (childStage ? `${parentStage} / ${childStage}` : parentStage) : null,
            region,
          });
        }
      }
      column = startColumn + cell.colspan;
    }
  });
  return candidates;
}

function parseTimedHtmlCell(text: string): Pick<TimedTextCandidate, "time" | "endTime" | "text"> | null {
  const match = text.match(
    /(?:^|\s|\/)([01]\d|2[0-3]):([0-5]\d)(?:\s*[-–—~〜～]\s*([01]\d|2[0-3]):([0-5]\d))?(?:\s|\/|$)/u,
  );
  if (!match?.[1] || !match[2]) return null;
  const name = text
    .slice((match.index ?? 0) + match[0].length)
    .replace(/^[\s/|:：-]+/u, "")
    .trim();
  if (name === "" || /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(name)) return null;
  return {
    time: `${match[1]}:${match[2]}`,
    endTime: match[3] && match[4] ? `${match[3]}:${match[4]}` : null,
    text: name,
  };
}

function normalizeHtmlCellText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?\s*>/giu, " / ")
      .replace(/<\/(?:p|div|li|h[1-6])\s*>/giu, " / ")
      .replace(/<[^>]+>/gu, " "),
  )
    .replace(/\s*\/\s*(?:\/\s*)+/gu, " / ")
    .replace(/\s+/gu, " ")
    .replace(/^\s*\/\s*|\s*\/\s*$/gu, "")
    .trim();
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"' };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/giu, (entity, code: string) => {
    if (code.startsWith("#x")) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    return named[code.toLocaleLowerCase()] ?? entity;
  });
}

function readHtmlSpan(attributes: string, name: "colspan" | "rowspan"): number {
  const match = attributes.match(new RegExp(`\\b${name}\\s*=\\s*["']?(\\d+)`, "iu"));
  const value = Number(match?.[1] ?? 1);
  return Number.isSafeInteger(value) && value > 0 ? value : 1;
}

function extractOcrMetadata(ocrResult: OcrResult): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();
  const scheduleNames = new Set(extractTimedTextCandidates(ocrResult).map(({ text }) => text));
  for (const { text } of ocrResult.regions) {
    const tableRows = extractHtmlTableRows(text);
    if (tableRows.length > 0) {
      for (const cell of tableRows.flat()) {
        const line = cell.text;
        if (
          line === "" ||
          /(?:ステージ|STAGE)/iu.test(line) ||
          parseTimedHtmlCell(line) ||
          /^(?:[01]\d|2[0-3]):[0-5]\d(?:\s*[-–—~〜～].*)?$/u.test(line) ||
          scheduleNames.has(line) ||
          seen.has(line)
        ) {
          continue;
        }
        seen.add(line);
        lines.push(line);
      }
      continue;
    }
    for (const rawLine of text.split(/\r?\n/u)) {
      const line = rawLine.trim();
      const unbulleted = line.replace(/^-\s*/u, "");
      if (
        line === "" ||
        /^#\s*STAGE_INDEX\s*:/iu.test(line) ||
        /^#{2,}\s*(?:STAGE|SECTION)\s*:/iu.test(line) ||
        (/^#{2,}\s/u.test(line) && /(?:ステージ|STAGE)/iu.test(line)) ||
        /^-\s*(?:[01]\d|2[0-3]):[0-5]\d/iu.test(line) ||
        scheduleNames.has(unbulleted) ||
        seen.has(line)
      ) {
        continue;
      }
      seen.add(line);
      lines.push(line);
    }
  }
  return lines;
}

export function parseGemmaDocument(raw: string): TimetableDocument {
  console.info("[My Timetable][Gemma] Raw result", raw);
  const result = validateGemmaValue(parseGemmaJson(raw));
  console.info("[My Timetable][Gemma] Structured result", result);
  return result;
}

export function parseGemmaResponse(raw: string): TimetableDocument {
  console.info("[My Timetable][Gemma] Raw result", raw);
  const value = parseGemmaJson(raw);
  const compactCandidate = normalizeCompactGemmaValue(value);
  const compact = compactGemmaResultSchema.safeParse(compactCandidate);
  let result: TimetableDocument;
  if (compact.success) {
    result = validateGemmaValue(expandCompactGemmaResult(compact.data));
  } else if (isCompactGemmaValue(value)) {
    throw new AppError("gemmaInvalidData");
  } else {
    result = validateGemmaValue(value);
  }
  console.info("[My Timetable][Gemma] Structured result", result);
  return result;
}

function isCompactGemmaValue(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record.event) ||
    (Array.isArray(record.schedules) && record.schedules.some((schedule) => Array.isArray(schedule)))
  );
}

function normalizeCompactGemmaValue(value: unknown): unknown {
  if (!isCompactGemmaValue(value)) return value;
  const event = Array.isArray(value.event) ? [...value.event] : value.event;
  if (Array.isArray(event) && typeof event[5] === "string") {
    event[5] = event[5].trim() === "" || event[5].trim() === "[]" ? [] : [event[5]];
  }
  const schedules = Array.isArray(value.schedules)
    ? value.schedules.map((schedule) => {
        if (!Array.isArray(schedule)) return schedule;
        const normalized = [...schedule];
        if (
          normalized.length === 12 &&
          normalized[9] === null &&
          typeof normalized[10] === "object" &&
          normalized[10] !== null &&
          !Array.isArray(normalized[10])
        ) {
          normalized.splice(9, 1);
        }
        if (normalized.length === 11 && normalized[9] === null) normalized[9] = {};
        return normalized;
      })
    : value.schedules;
  return { ...value, event, schedules };
}

function parseGemmaJson(raw: string): unknown {
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
  return value;
}

function validateGemmaValue(value: unknown): TimetableDocument {
  const parsed = timetableDocumentSchema.safeParse(normalizeGemmaValue(value));
  if (!parsed.success) {
    throw new AppError("gemmaInvalidData");
  }
  return parsed.data;
}

function expandCompactGemmaResult(result: z.infer<typeof compactGemmaResultSchema>): unknown {
  const [name, date, venue, openTime, startTime, notes] = result.event;
  return {
    schemaVersion: 2,
    event: {
      name,
      date,
      timezone: "Asia/Tokyo",
      venue,
      openTime,
      startTime,
      notes,
    },
    schedules: result.schedules.map((schedule, index) => {
      const [
        artist,
        type,
        scheduleDate,
        scheduleStartTime,
        endTime,
        endsNextDay,
        relativeTimeLabel,
        stage,
        booth,
        attributes,
        confidence,
      ] = schedule;
      return {
        id: `model-${index + 1}`,
        artist,
        type,
        date: scheduleDate,
        startTime: scheduleStartTime,
        endTime,
        endTimeSource: endTime ? "explicit" : "missing",
        endsNextDay,
        relativeTimeLabel,
        stage,
        booth,
        attributes,
        confidence,
        verified: false,
        sourceRegions: [],
      };
    }),
  };
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
  let lastRecoverableLength = 0;

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
      lastRecoverableLength = recovered.length;
    }
  }

  if (inString) {
    return lastRecoverableLength > 0 ? recoverJsonDocument(recovered.slice(0, lastRecoverableLength)) : null;
  }
  if (stack.length === 0) return null;
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
  model: (typeof gemmaModels)[GemmaModelId],
  onProgress: (progress: GemmaProgress) => void,
  signal: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const { url, cacheName } = model;
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
