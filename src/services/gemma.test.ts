import { afterEach, describe, expect, it, vi } from "vitest";
import {
  configureLiteRtWasmAssets,
  createGemmaUserPrompt,
  finalizeGemmaDocument,
  parseGemmaDocument,
  parseGemmaResponse,
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

  it("recovers complete schedules when the response is truncated inside the next schedule", () => {
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const complete = JSON.stringify(valid);
    const truncated = `${complete.slice(0, -2)},{"id":"2","artist":"unfinished`;

    const result = parseGemmaDocument(truncated);

    expect(result.schedules).toEqual(valid.schedules);
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

describe("parseGemmaResponse", () => {
  it("expands the compact successful JSON format into the domain document", () => {
    const result = parseGemmaResponse(
      JSON.stringify({
        event: ["Festival", null, null, null, null, []],
        schedules: [["Artist", "live", null, "10:00", "10:30", false, null, "Stage", null, {}, "high"]],
      }),
    );

    expect(result).toEqual({
      ...valid,
      schedules: [{ ...valid.schedules[0], id: "model-1", stage: "Stage" }],
    });
  });

  it("normalizes common compact JSON type and tuple-width deviations", () => {
    const result = parseGemmaResponse(
      JSON.stringify({
        event: ["Festival", null, null, null, null, "[]"],
        schedules: [["Artist", "live", null, "10:00", "10:30", false, null, "Stage", null, null, {}, "low"]],
      }),
    );

    expect(result.event.notes).toEqual([]);
    expect(result.schedules[0]).toMatchObject({
      artist: "Artist",
      stage: "Stage",
      booth: null,
      attributes: {},
    });
  });

  it("rejects malformed compact JSON instead of coercing it into blank schedules", () => {
    expect(() => parseGemmaResponse(JSON.stringify({ event: [], schedules: [["Artist"]] }))).toThrowError(
      expect.objectContaining({ code: "gemmaInvalidData" }),
    );
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
      content: JSON.stringify({
        event: ["Festival", null, null, null, null, []],
        schedules: [["Artist", "live", null, "10:00", "10:30", false, null, null, null, {}, "high"]],
      }),
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
    expect(createConversation).toHaveBeenCalledWith({
      sessionConfig: {
        maxOutputTokens: 4096,
        samplerParams: { k: 1, seed: 0 },
      },
      preface: {
        messages: [
          {
            role: "system",
            content: expect.stringMatching(
              /successful response.*"event":\["Festival".*Never output schedule items as objects/s,
            ),
          },
        ],
      },
    });
    expect(deleteConversation).toHaveBeenCalledOnce();
    expect(deleteEngine).toHaveBeenCalledOnce();
    expect(result).toEqual({
      ...valid,
      schedules: [{ ...valid.schedules[0], id: "item-1" }],
    });
  });

  it("re-prompts with the successful JSON example when the first response is not JSON", async () => {
    const compact = JSON.stringify({
      event: ["Festival", null, null, null, null, []],
      schedules: [["Artist", "live", null, "10:00", "10:30", false, null, null, null, {}, "high"]],
    });
    const sendMessage = vi
      .fn<(prompt: string) => Promise<{ content: string }>>()
      .mockResolvedValueOnce({ content: "JSONではない応答" })
      .mockResolvedValueOnce({ content: compact });
    const deleteConversation = vi.fn<() => Promise<void>>(async () => undefined);
    const deleteEngine = vi.fn<() => Promise<void>>(async () => undefined);
    const cancel = vi.fn<() => void>();
    const createConversation = vi.fn<
      () => Promise<{
        cancel: typeof cancel;
        delete: typeof deleteConversation;
        sendMessage: typeof sendMessage;
      }>
    >(async () => ({
      cancel,
      delete: deleteConversation,
      sendMessage,
    }));
    vi.doMock("@litert-lm/core", () => ({
      Engine: {
        create: async () => ({
          createConversation,
          delete: deleteEngine,
        }),
      },
    }));
    vi.stubGlobal("navigator", { gpu: {} });
    vi.stubGlobal("caches", {
      open: async () => ({ match: async () => new Response(new Uint8Array([1])) }),
    });

    const result = await structureWithGemma(
      { engine: "glm-ocr", image: { width: 1, height: 1 }, text: "Artist 10:00", regions: [] },
      vi.fn(),
      new AbortController().signal,
    );

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(createConversation).toHaveBeenCalledTimes(2);
    expect(sendMessage.mock.calls[1]?.[0]).toMatch(/前回の出力.*成功例.*"event":\["Festival"/s);
    expect(result.schedules[0]).toMatchObject({ artist: "Artist", startTime: "10:00" });
    expect(deleteConversation).toHaveBeenCalledTimes(2);
    expect(deleteEngine).toHaveBeenCalledOnce();
  });

  it("re-prompts with every missing OCR stage when the first JSON covers only one stage", async () => {
    const compact = (schedules: unknown[]) =>
      JSON.stringify({ event: ["Festival", null, null, null, null, []], schedules });
    const sea = ["Sea Artist", "live", null, "10:00", null, false, null, "ムロ海ステージ", null, {}, "high"];
    const brick = [
      "Brick Artist",
      "live",
      null,
      "10:00",
      null,
      false,
      null,
      "ムロ赤レンガステージ",
      null,
      {},
      "high",
    ];
    const grass = [
      "Grass Artist",
      "live",
      null,
      "10:00",
      null,
      false,
      null,
      "ムロ芝生ステージ",
      null,
      {},
      "high",
    ];
    const sendMessage = vi
      .fn<(prompt: string) => Promise<{ content: string }>>()
      .mockResolvedValueOnce({ content: compact([sea]) })
      .mockResolvedValueOnce({ content: compact([sea, brick, grass]) });
    const deleteConversation = vi.fn<() => Promise<void>>(async () => undefined);
    const deleteEngine = vi.fn<() => Promise<void>>(async () => undefined);
    const cancel = vi.fn<() => void>();
    const createConversation = vi.fn<
      () => Promise<{
        cancel: typeof cancel;
        delete: typeof deleteConversation;
        sendMessage: typeof sendMessage;
      }>
    >(async () => ({ cancel, delete: deleteConversation, sendMessage }));
    vi.doMock("@litert-lm/core", () => ({
      Engine: {
        create: async () => ({ createConversation, delete: deleteEngine }),
      },
    }));
    vi.stubGlobal("navigator", { gpu: {} });
    vi.stubGlobal("caches", {
      open: async () => ({ match: async () => new Response(new Uint8Array([1])) }),
    });
    const stageText = [
      "## STAGE: ムロ海ステージ",
      "## STAGE: ムロ赤レンガステージ",
      "## STAGE: ムロ芝生ステージ",
    ].join("\n");

    const result = await structureWithGemma(
      {
        engine: "glm-ocr",
        image: { width: 100, height: 100 },
        text: stageText,
        regions: [
          {
            id: "full-image",
            kind: "overview",
            text: stageText,
            order: 0,
            confidence: null,
            region: { x: 0, y: 0, width: 100, height: 100 },
          },
        ],
      },
      vi.fn(),
      new AbortController().signal,
    );

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage.mock.calls[1]?.[0]).toMatch(/ムロ赤レンガステージ.*ムロ芝生ステージ/s);
    expect(result.schedules.map(({ stage }) => stage)).toEqual([
      "ムロ海ステージ",
      "ムロ赤レンガステージ",
      "ムロ芝生ステージ",
    ]);
    expect(deleteConversation).toHaveBeenCalledTimes(2);
    expect(deleteEngine).toHaveBeenCalledOnce();
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

    expect(prompt).toContain('"time":"12:30","endTime":null,"text":"yours jz"');
    expect(prompt).toContain('"time":"13:30","endTime":null,"text":"ファジーデイズ"');
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

  it("compacts full-image Markdown stage sections without repeating the OCR schedule rows", () => {
    const stageText = [
      "### ムロ海ステージ",
      "#### LEFT STAGE",
      "- 10:00-10:25",
      "- kobore",
      "### ムロ赤レンガステージ",
      "#### RIGHT STAGE",
      "- 10:25-10:50",
      "- ちゃくら",
    ].join("\n");
    const prompt = createGemmaUserPrompt({
      engine: "glm-ocr",
      image: { width: 1000, height: 2000 },
      text: stageText,
      regions: [
        {
          id: "full-image",
          kind: "overview",
          text: stageText,
          order: 0,
          confidence: null,
          region: { x: 0, y: 0, width: 1000, height: 2000 },
        },
      ],
    });

    expect(prompt).toContain(
      'scheduleCandidates=[["kobore","10:00","10:25","ムロ海ステージ / LEFT STAGE"],["ちゃくら","10:25","10:50","ムロ赤レンガステージ / RIGHT STAGE"]]',
    );
    expect(prompt).not.toContain("ocrResult=");
    expect(prompt.match(/kobore/gu)).toHaveLength(1);
  });

  it("compacts GLM table-recognition HTML while preserving every stage and table row", () => {
    const table = [
      '<table class="table table-bordered"><tbody>',
      '<tr><th rowspan="2">TIME</th><th colspan="2">ムロ海ステージ</th><th colspan="2">ムロ赤レンガステージ</th><th colspan="2">ムロ芝生ステージ</th></tr>',
      "<tr><th>LEFT STAGE</th><th>RIGHT STAGE</th><th>LEFT STAGE</th><th>RIGHT STAGE</th><th>LEFT STAGE</th><th>RIGHT STAGE</th></tr>",
      "<tr><td>10:00</td><td>10:00-10:25<br>kobore</td><td>10:25-10:50<br>UNFAIR RULE</td><td>10:00-10:25<br>終活クラブ</td><td>10:25-10:50<br>ちゃくら</td><td>10:00-10:25<br>プライドの高い深夜のコンビニアルバイト</td><td>10:25-10:50<br>VOI SQUARE CAT</td></tr>",
      "</tbody></table>",
    ].join("");
    const prompt = createGemmaUserPrompt({
      engine: "glm-ocr",
      image: { width: 1000, height: 2000 },
      text: `[full-image overview]\n${table}`,
      regions: [
        {
          id: "full-image",
          kind: "overview",
          text: table,
          order: 0,
          confidence: null,
          region: { x: 0, y: 0, width: 1000, height: 2000 },
        },
      ],
    });

    expect(prompt).toContain(
      'requiredStageHeadings=["ムロ海ステージ","ムロ赤レンガステージ","ムロ芝生ステージ"]',
    );
    expect(prompt).toContain('["VOI SQUARE CAT","10:25","10:50","ムロ芝生ステージ / RIGHT STAGE"]');
    expect(prompt).toContain('["終活クラブ","10:00","10:25","ムロ赤レンガステージ / LEFT STAGE"]');
    expect(prompt).not.toContain("table-bordered");
    expect(prompt).not.toContain("<td>");
  });

  it("passes compact table rows instead of raw HTML when time and name use separate cells", () => {
    const table =
      '<table class="table table-bordered"><tr><th colspan="2">ムロ赤レンガステージ</th><th colspan="2">ムロ芝生ステージ</th></tr><tr><td>10:00-10:25</td><td>終活クラブ</td><td>10:25-10:50</td><td>VOI SQUARE CAT</td></tr></table>';
    const prompt = createGemmaUserPrompt({
      engine: "glm-ocr",
      image: { width: 1000, height: 2000 },
      text: table,
      regions: [
        {
          id: "full-image",
          kind: "overview",
          text: table,
          order: 0,
          confidence: null,
          region: { x: 0, y: 0, width: 1000, height: 2000 },
        },
      ],
    });

    expect(prompt).toContain(
      'tableRows=[["ムロ赤レンガステージ [c2]","ムロ芝生ステージ [c2]"],["10:00-10:25","終活クラブ","10:25-10:50","VOI SQUARE CAT"]]',
    );
    expect(prompt).not.toContain("table-bordered");
    expect(prompt).not.toContain("ocrResult=");
  });
});

describe("finalizeGemmaDocument", () => {
  it("recovers compact full-image rows with their parent and child stages", () => {
    const region = { x: 0, y: 0, width: 1000, height: 2000 };
    const stageText = ["### ムロ芝生ステージ", "#### RIGHT STAGE", "- 10:25-10:50", "- VOI SQUARE CAT"].join(
      "\n",
    );
    const document = parseGemmaDocument(JSON.stringify({ ...valid, schedules: [] }));

    const result = finalizeGemmaDocument(document, {
      engine: "glm-ocr",
      image: { width: 1000, height: 2000 },
      text: stageText,
      regions: [
        {
          id: "full-image",
          kind: "overview",
          text: stageText,
          order: 0,
          confidence: null,
          region,
        },
      ],
    });

    expect(result.schedules).toEqual([
      expect.objectContaining({
        artist: "VOI SQUARE CAT",
        startTime: "10:25",
        endTime: "10:50",
        endTimeSource: "explicit",
        stage: "ムロ芝生ステージ / RIGHT STAGE",
        sourceRegions: [region],
      }),
    ]);
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
      regions: [
        { id: "column-1", kind: "column", text: "", order: 0, confidence: null, region },
        {
          id: "column-2",
          kind: "column",
          text: "",
          order: 1,
          confidence: null,
          region: { x: 500, y: 0, width: 500, height: 1000 },
        },
      ],
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

  it("grounds every schedule in the sole full-image OCR region", () => {
    const region = { x: 0, y: 0, width: 1684, height: 2382 };
    const document = parseGemmaDocument(
      JSON.stringify({
        ...valid,
        schedules: [
          {
            ...valid.schedules[0],
            sourceRegions: [{ x: 1, y: 2, width: 3, height: 4 }],
          },
        ],
      }),
    );

    const result = finalizeGemmaDocument(document, {
      engine: "glm-ocr",
      image: { width: 1684, height: 2382 },
      text: "",
      regions: [{ id: "full-image", kind: "overview", text: "", order: 0, confidence: null, region }],
    });

    expect(result.schedules[0]?.sourceRegions).toEqual([region]);
  });
});
