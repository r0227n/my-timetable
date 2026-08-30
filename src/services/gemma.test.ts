import { afterEach, describe, expect, it, vi } from "vitest";
import {
  configureLiteRtWasmAssets,
  createGemmaUserPrompt,
  finalizeGemmaDocument,
  parseGemmaDocument,
  structureWithGemma,
} from "./gemma";

const valid = {
  schemaVersion: 2,
  event: {
    name: "Festival",
    date: null,
    timezone: "Asia/Tokyo",
    venue: null,
    openTime: null,
    startTime: null,
    notes: [],
  },
  schedules: [
    {
      id: "1",
      artist: "Artist",
      type: "live",
      date: null,
      startTime: "10:00",
      endTime: "10:30",
      endTimeSource: "explicit",
      endsNextDay: false,
      relativeTimeLabel: null,
      stage: null,
      booth: null,
      attributes: {},
      confidence: "high",
      verified: false,
      sourceRegions: [],
    },
  ],
};

describe("parseGemmaDocument", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("accepts valid JSON wrapped in a code fence", () => {
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const result = parseGemmaDocument(`\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``);

    expect(result.event.name).toBe("Festival");
    expect(consoleInfo).toHaveBeenNthCalledWith(1, "[My Timetable][Gemma] Raw result", expect.any(String));
    expect(consoleInfo).toHaveBeenNthCalledWith(2, "[My Timetable][Gemma] Structured result", result);
  });

  it("keeps valid data and marks invalid fields as unresolved", () => {
    const result = parseGemmaDocument(
      JSON.stringify({
        ...valid,
        schedules: [{ ...valid.schedules[0], type: "concert", startTime: "morning", confidence: "certain" }],
      }),
    );

    expect(result.event.name).toBe("Festival");
    expect(result.schedules[0]).toEqual(
      expect.objectContaining({ type: "other", startTime: null, confidence: "low", verified: false }),
    );
  });

  it("repairs a response truncated after the schedules array and keeps a partial date unresolved", () => {
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const truncated = JSON.stringify({
      ...valid,
      event: { ...valid.event, date: "9/22" },
    }).slice(0, -1);

    const result = parseGemmaDocument(truncated);

    expect(result.event.date).toBeNull();
    expect(result.schedules).toHaveLength(1);
    expect(consoleInfo).toHaveBeenLastCalledWith("[My Timetable][Gemma] Structured result", result);
  });

  it("ignores an extra closing brace after a complete JSON document", () => {
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const result = parseGemmaDocument(`${JSON.stringify(valid)}}`);

    expect(result).toEqual(valid);
    expect(consoleInfo).toHaveBeenLastCalledWith("[My Timetable][Gemma] Structured result", result);
  });

  it("extracts the first JSON object when the model adds explanatory text", () => {
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const result = parseGemmaDocument(`解析結果です。\n\n${JSON.stringify(valid)}\n以上です。`);

    expect(result).toEqual(valid);
    expect(consoleInfo).toHaveBeenLastCalledWith("[My Timetable][Gemma] Structured result", result);
  });

  it("repairs a stray quote after a numeric coordinate and flattens a nested OCR region", () => {
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const malformed = JSON.stringify({
      ...valid,
      schedules: [
        {
          ...valid.schedules[0],
          sourceRegions: [{ id: "column-1", region: { x: 0, y: 0, width: 1240, height: 1754 } }],
        },
      ],
    }).replace('"height":1754', '"height":1754"');

    const result = parseGemmaDocument(malformed);

    expect(result.schedules[0]?.sourceRegions).toEqual([{ x: 0, y: 0, width: 1240, height: 1754 }]);
    expect(consoleInfo).toHaveBeenLastCalledWith("[My Timetable][Gemma] Structured result", result);
  });

  it("repairs a missing schedules array closer from a Gemma response", () => {
    const malformed = JSON.stringify({
      ...valid,
      schedules: [
        {
          ...valid.schedules[0],
          sourceRegions: [{ id: "column-1", region: { x: 0, y: 0, width: 1240, height: 1754 } }],
        },
      ],
    })
      .replace('"height":1754', '"height":1754"')
      .replace(/\]\}$/, "}");

    const result = parseGemmaDocument(malformed);

    expect(result.schedules).toHaveLength(1);
    expect(result.schedules[0]?.sourceRegions).toEqual([{ x: 0, y: 0, width: 1240, height: 1754 }]);
  });
});

describe("structureWithGemma", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs through the page engine instead of an unbundled classic worker", async () => {
    let workerCreations = 0;
    class FakeWorker {
      constructor() {
        workerCreations += 1;
      }
    }
    vi.stubGlobal("Worker", FakeWorker);
    vi.stubGlobal("navigator", {});

    await expect(
      structureWithGemma(
        { engine: "glm-ocr", image: { width: 1, height: 1 }, text: "", regions: [] },
        vi.fn(),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "gemmaWebGpuRequired" });

    expect(workerCreations).toBe(0);
  });
});

describe("configureLiteRtWasmAssets", () => {
  afterEach(() => {
    delete (globalThis as typeof globalThis & { Module?: unknown }).Module;
  });

  it("resolves the runtime binary beside the imported LiteRT-LM loader", () => {
    configureLiteRtWasmAssets("https://cdn.example.test/litert/wasm/");

    const module = (
      globalThis as typeof globalThis & {
        Module?: { locateFile?: (path: string) => string };
      }
    ).Module;
    expect(module?.locateFile?.("litertlm_wasm_asyncify_internal.wasm")).toBe(
      "https://cdn.example.test/litert/wasm/litertlm_wasm_asyncify_internal.wasm",
    );
  });
});

describe("createGemmaUserPrompt", () => {
  it("lists every clear column time-name pair as a required candidate", () => {
    const prompt = createGemmaUserPrompt({
      engine: "glm-ocr",
      image: { width: 100, height: 200 },
      text: "",
      regions: [
        {
          id: "column-1",
          kind: "column",
          text: "12:30 ~\nyours jz\n13:30 ~\nファジーデイズ",
          order: 0,
          confidence: null,
          region: { x: 10, y: 0, width: 90, height: 200 },
        },
      ],
    });

    expect(prompt).toContain('"time":"12:30","text":"yours jz"');
    expect(prompt).toContain('"time":"13:30","text":"ファジーデイズ"');
  });

  it("preserves OCR content beyond the previous truncation boundary", () => {
    const tail = "END-OF-OCR";
    const prompt = createGemmaUserPrompt({
      engine: "glm-ocr",
      image: { width: 1000, height: 2000 },
      text: `${"x".repeat(25_000)}${tail}`,
      regions: [
        {
          id: "column-1",
          kind: "column",
          text: `${"x".repeat(25_000)}${tail}`,
          order: 0,
          confidence: null,
          region: { x: 0, y: 0, width: 1000, height: 2000 },
        },
      ],
    });

    expect(prompt).toContain(tail);
    expect(prompt.length).toBeGreaterThan(25_000);
  });
});

describe("finalizeGemmaDocument", () => {
  it("recovers every clear time and artist pair when Gemma returns only an empty first item", () => {
    const overview = { x: 0, y: 0, width: 199, height: 804 };
    const column = { x: 46, y: 0, width: 153, height: 804 };
    const ocrResult = {
      engine: "glm-ocr" as const,
      image: { width: 199, height: 804 },
      text: "",
      regions: [
        {
          id: "overview",
          kind: "overview" as const,
          text: "12:30 ~\nyours jj\n13:30 ~\nファジーデイズ\n14:30 ~\nRIP DISHONOR\n15:30 ~\ngrating hunny\n16:30 ~\nステレオドロシー\n17:30 ~\nスパノヴァ特急\n18:30 ~\nイロムク\n19:30 ~\n月と徒花\n20:30 ~\nAdult family",
          order: 0,
          confidence: null,
          region: overview,
        },
        {
          id: "column-3",
          kind: "column" as const,
          text: "12:30 ~\nyours jz\n\n13:30 ~\nファジーデイズ\n\n14:30 ~\nRIP DISHONOR\n\n15:30 ~\ngrating hunny\n\n16:30 ~\nステレオドロシー\n\n17:30 ~\nスパヴァ特急\n\n18:30 ~\nイロムク\n\n19:30 ~\n月と徒花\n\n20:30 ~\nAdult family",
          order: 1,
          confidence: null,
          region: column,
        },
      ],
    };
    const incomplete = parseGemmaDocument(
      JSON.stringify({
        ...valid,
        event: { ...valid.event, name: "" },
        schedules: [
          {
            ...valid.schedules[0],
            artist: "",
            startTime: "12:30",
            endTime: null,
            endTimeSource: "missing",
            confidence: "low",
            sourceRegions: [overview, column],
          },
        ],
      }),
    );

    const result = finalizeGemmaDocument(incomplete, ocrResult);

    expect(result.schedules.map(({ startTime, artist }) => [startTime, artist])).toEqual([
      ["12:30", "yours jz"],
      ["13:30", "ファジーデイズ"],
      ["14:30", "RIP DISHONOR"],
      ["15:30", "grating hunny"],
      ["16:30", "ステレオドロシー"],
      ["17:30", "スパヴァ特急"],
      ["18:30", "イロムク"],
      ["19:30", "月と徒花"],
      ["20:30", "Adult family"],
    ]);
    expect(result.schedules.every(({ sourceRegions }) => sourceRegions.length > 0)).toBe(true);
  });

  it("grounds source regions, assigns stable unique ids, and proposes missing end times", () => {
    const region = { x: 0, y: 0, width: 500, height: 1000 };
    const document = parseGemmaDocument(
      JSON.stringify({
        ...valid,
        schedules: [
          {
            ...valid.schedules[0],
            id: "duplicate",
            endTime: null,
            endTimeSource: "missing",
            sourceRegions: [region],
          },
          {
            ...valid.schedules[0],
            id: "duplicate",
            artist: "Later",
            startTime: "10:40",
            endTime: null,
            endTimeSource: "missing",
            sourceRegions: [{ x: 9, y: 9, width: 9, height: 9 }],
          },
        ],
      }),
    );

    const result = finalizeGemmaDocument(document, {
      engine: "glm-ocr",
      image: { width: 500, height: 1000 },
      text: "",
      regions: [{ id: "column-1", kind: "column", text: "", order: 0, confidence: null, region }],
    });

    expect(result.schedules[0]).toMatchObject({
      id: "item-1",
      endTime: "10:40",
      endTimeSource: "inferred_next_start",
      sourceRegions: [region],
    });
    expect(result.schedules[1]).toMatchObject({
      id: "item-2",
      endTime: "11:10",
      endTimeSource: "inferred_default",
      sourceRegions: [],
    });
  });
});
