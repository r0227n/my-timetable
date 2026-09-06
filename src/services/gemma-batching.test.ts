import { afterEach, expect, it, vi } from "vitest";
import { structureWithGemma } from "./gemma";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.doUnmock("@litert-lm/core");
});

it.each([
  { label: "物販", calls: 1 },
  { label: "物販時間", calls: 8 },
])("bounds structuring for $label tables", async ({ label, calls }) => {
  const rows = Array.from(
    { length: 30 },
    (_, index) =>
      `<tr><td>09:30〜09:50</td><td>Group ${index + 1}</td><td>${label}</td><td>Ⓐ10:10〜11:30</td></tr>`,
  );
  const sendMessage = vi.fn<(prompt: string) => Promise<{ content: string }>>(async (prompt) => {
    const names = [...new Set(prompt.match(/Group \d+/g))];
    if (names.length > 6) throw new Error("Gemma output token budget exceeded");
    return {
      content: JSON.stringify({
        event: ["Festival", "2026-09-13", "Hall", null, null, []],
        schedules: names.flatMap((name) => [
          [name, "live", "2026-09-13", "09:30", "09:50", false, null, null, null, {}, "high"],
          [name, "merch", "2026-09-13", "10:10", "11:30", false, null, null, "A", {}, "high"],
        ]),
      }),
    };
  });
  const deleteConversation = vi.fn<() => Promise<void>>(async () => {});
  const createConversation = vi.fn<
    () => Promise<{ sendMessage: typeof sendMessage; delete: typeof deleteConversation; cancel: () => void }>
  >(async () => ({
    sendMessage,
    delete: deleteConversation,
    cancel: vi.fn<() => void>(),
  }));
  vi.doMock("@litert-lm/core", () => ({
    Engine: {
      create: async () => ({ createConversation, delete: vi.fn<() => Promise<void>>(async () => {}) }),
    },
  }));
  vi.stubGlobal("navigator", { gpu: {} });
  vi.stubGlobal("caches", { open: async () => ({ match: async () => new Response(new Uint8Array([1])) }) });
  const text = `2026.09.13 Festival\n<table>${rows.join("")}</table>`;
  const result = await structureWithGemma(
    {
      engine: "glm-ocr",
      image: { width: 1500, height: 2000 },
      text,
      regions: [
        {
          id: "full",
          kind: "overview",
          text,
          order: 0,
          confidence: null,
          region: { x: 0, y: 0, width: 1500, height: 2000 },
        },
      ],
    },
    vi.fn(),
    new AbortController().signal,
  );
  expect(result.schedules).toHaveLength(60);
  expect(new Set(result.schedules.map((item) => item.id)).size).toBe(60);
  expect(createConversation).toHaveBeenCalledTimes(calls);
  expect(sendMessage.mock.calls[0]?.[0]).not.toContain("Group 30");
  expect(sendMessage.mock.calls[0]?.[0]).toContain("2026.09.13");
  expect(deleteConversation).toHaveBeenCalledTimes(createConversation.mock.calls.length);
  expect(result.schedules.filter((item) => item.type === "merch").every((item) => item.booth === "A")).toBe(
    true,
  );
});
