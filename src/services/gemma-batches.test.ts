import { expect, it } from "vitest";
import type { OcrResult } from "@my-timetable/glm-ocr-web";
import { createGemmaBatches } from "./gemma-batches";

function input(text: string): OcrResult {
  return {
    engine: "glm-ocr",
    text,
    image: { width: 1500, height: 2000 },
    regions: [
      {
        id: "band",
        kind: "column",
        order: 0,
        confidence: null,
        text,
        region: { x: 0, y: 440, width: 1500, height: 540 },
      },
    ],
  };
}

it("shares event metadata and after-show times without copying other artists into each batch", () => {
  const result = createGemmaBatches(
    input(
      `2026.09.13 KANDA SQUARE HALL\n<table><tr><th>出演時間</th><th>出演者</th><th>物販</th></tr>${Array.from({ length: 10 }, (_, i) => `<tr><td>10:00〜10:20</td><td>Group${i}</td><td>終演後</td></tr>`).join("")}<tr><td colspan="3">21:35〜22:55 終演後物販</td></tr></table>`,
    ),
  );
  expect(result).toHaveLength(3);
  for (const batch of result) {
    expect(batch.text.match(/Group\d+/gu)?.length).toBeLessThanOrEqual(4);
    expect(batch.text).toContain("出演者");
    expect(batch.regions.find((region) => region.kind === "header")?.text).toContain(
      "21:35〜22:55 終演後物販",
    );
    expect(batch.regions.find((region) => region.kind === "header")?.text).toContain("2026.09.13");
    expect(batch.regions[0]?.region.y).toBe(440);
  }
});

it("keeps a time and following name together and carries stage headings", () => {
  const result = createGemmaBatches(
    input(
      `### Sea STAGE\n#### LEFT STAGE\n${Array.from({ length: 12 }, (_, i) => `- 10:00-10:25\n- Artist${i}`).join("\n")}`,
    ),
  );
  expect(result).toHaveLength(3);
  for (const batch of result) {
    expect(batch.text).toContain("Sea STAGE");
    expect(batch.text).toContain("LEFT STAGE");
    expect(batch.text.match(/Artist\d+/gu)).toHaveLength(4);
  }
});
