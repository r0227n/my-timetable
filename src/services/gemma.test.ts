import { afterEach, describe, expect, it, vi } from "vitest";
import {
  configureLiteRtWasmAssets,
  createGemmaUserPrompt,
  finalizeGemmaDocument,
  parseGemmaDocument,
  structureWithGemma,
} from "./gemma";

const valid = {
  schemaVersion: 3,
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
      title: null,
      relationGroupId: null,
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
    vi.doUnmock("@litert-lm/core");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (globalThis as typeof globalThis & { Module?: unknown }).Module;
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

  it("configures LiteRT assets before creating a page engine and releases its resources", async () => {
    const events: string[] = [];
    const cancel = vi.fn<() => void>();
    const deleteConversation = vi.fn<() => Promise<void>>(async () => undefined);
    const sendMessage = vi.fn<() => Promise<{ content: string }>>(async () => ({
      content: JSON.stringify(valid),
    }));
    const createConversation = vi.fn<
      () => Promise<{
        cancel: typeof cancel;
        delete: typeof deleteConversation;
        sendMessage: typeof sendMessage;
      }>
    >(async () => ({ cancel, delete: deleteConversation, sendMessage }));
    const deleteEngine = vi.fn<() => Promise<void>>(async () => undefined);
    const createEngine = vi.fn<
      () => Promise<{ createConversation: typeof createConversation; delete: typeof deleteEngine }>
    >(async () => {
      const module = (
        globalThis as typeof globalThis & {
          Module?: { locateFile?: (path: string) => string };
        }
      ).Module;
      events.push(module?.locateFile?.("litertlm_wasm_asyncify_internal.wasm") ?? "missing");
      return { createConversation, delete: deleteEngine };
    });
    vi.doMock("@litert-lm/core", () => ({ Engine: { create: createEngine } }));
    vi.stubGlobal("navigator", { gpu: {} });
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          throw new Error("Gemma must not create a classic worker");
        }
      },
    );
    const cacheMatch = vi.fn<() => Promise<Response>>(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-length": "3" },
        }),
    );
    vi.stubGlobal("caches", {
      open: async () => ({
        match: cacheMatch,
      }),
    });

    const result = await structureWithGemma(
      { engine: "glm-ocr", image: { width: 1, height: 1 }, text: "Artist 10:00", regions: [] },
      vi.fn(),
      new AbortController().signal,
      "e4b",
    );

    expect(events).toEqual([
      "https://cdn.jsdelivr.net/npm/@litert-lm/core@0.15.0/wasm/litertlm_wasm_asyncify_internal.wasm",
    ]);
    expect(createEngine).toHaveBeenCalledOnce();
    expect(cacheMatch).toHaveBeenCalledWith(
      "https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it-web.litertlm",
    );
    expect(sendMessage).toHaveBeenCalledOnce();
    expect(deleteConversation).toHaveBeenCalledOnce();
    expect(deleteEngine).toHaveBeenCalledOnce();
    expect(result).toEqual({
      ...valid,
      schedules: [{ ...valid.schedules[0], id: "item-1" }],
    });
  });

  it("cancels an active page conversation when analysis is aborted and still releases resources", async () => {
    const controller = new AbortController();
    const cancel = vi.fn<() => void>();
    const deleteConversation = vi.fn<() => Promise<void>>(async () => undefined);
    const deleteEngine = vi.fn<() => Promise<void>>(async () => undefined);
    const sendMessage = vi.fn<() => Promise<never>>(
      () =>
        new Promise<never>((_resolve, reject) => {
          controller.signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            {
              once: true,
            },
          );
        }),
    );
    vi.doMock("@litert-lm/core", () => ({
      Engine: {
        create: async () => ({
          createConversation: async () => ({ cancel, delete: deleteConversation, sendMessage }),
          delete: deleteEngine,
        }),
      },
    }));
    vi.stubGlobal("navigator", { gpu: {} });
    vi.stubGlobal("caches", {
      open: async () => ({ match: async () => new Response(new Uint8Array([1])) }),
    });

    const analysis = structureWithGemma(
      { engine: "glm-ocr", image: { width: 1, height: 1 }, text: "Artist 10:00", regions: [] },
      vi.fn(),
      controller.signal,
    );
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledOnce());
    controller.abort();

    await expect(analysis).rejects.toMatchObject({ name: "AbortError" });
    expect(cancel).toHaveBeenCalledOnce();
    expect(deleteConversation).toHaveBeenCalledOnce();
    expect(deleteEngine).toHaveBeenCalledOnce();
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

    expect(prompt).toContain('"startTime":"12:30","endTime":null,"artist":"yours jz"');
    expect(prompt).toContain('"startTime":"13:30","endTime":null,"artist":"ファジーデイズ"');
  });

  it("describes LIVE and merchandise rows as separate related candidates without inventing IDs", () => {
    const prompt = createGemmaUserPrompt({
      engine: "glm-ocr",
      image: { width: 100, height: 200 },
      text: "",
      regions: [
        {
          id: "column-1",
          kind: "column",
          text: "09:30〜09:50 unFinale Tokyo 物販・特典会 Ⓐ10:10〜11:30\n21:35〜22:55 終演後物販",
          order: 0,
          confidence: null,
          region: { x: 0, y: 0, width: 100, height: 200 },
        },
      ],
    });

    expect(prompt).toContain('"artist":"unFinale Tokyo","title":null,"type":"live"');
    expect(prompt).toContain('"artist":"unFinale Tokyo","title":"物販・特典会","type":"meet_and_greet"');
    expect(prompt).toContain('"booth":"A"');
    expect(prompt).toContain('"artist":null,"title":"終演後物販","type":"merch"');
    expect(prompt).not.toContain('"relationGroupId"');
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
  it("normalizes model relationship indexes into application-owned opaque group IDs", () => {
    const result = parseGemmaDocument(
      JSON.stringify({
        ...valid,
        schedules: [
          { ...valid.schedules[0], relatedScheduleIndexes: [1] },
          {
            ...valid.schedules[0],
            id: "2",
            type: "merch",
            startTime: "10:40",
            endTime: "11:30",
            booth: "A",
            relatedScheduleIndexes: [0],
            relationGroupId: "model-controlled-id",
          },
        ],
      }),
    );

    expect(result.schedules.map((item) => item.relationGroupId)).toEqual(["relation-1", "relation-1"]);
    expect(result.schedules.map((item) => item.relationGroupId)).not.toContain("model-controlled-id");
  });

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
