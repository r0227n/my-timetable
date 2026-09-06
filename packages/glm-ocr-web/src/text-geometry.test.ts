import { expect, it } from "vitest";
import { refineTableKana, restoreSmallKana } from "./text-geometry";

const full = { x: 0, y: 5, width: 25, height: 26 };
const small = { x: 0, y: 10, width: 19, height: 21 };
it("restores small kana from narrower and lower source glyphs", () => {
  expect(restoreSmallKana("みやきつん", [full, small, full, small, full])).toBe("みゃきっん");
});
it("does not change full-sized kana or guess when glyph segmentation is ambiguous", () => {
  expect(restoreSmallKana("みやきつん", [full, full, full, full, full])).toBe("みやきつん");
  expect(restoreSmallKana("みやきつん", [full, small])).toBe("みやきつん");
  expect(restoreSmallKana("みやきつん", [full, { ...small, width: 25 }, full, full, full])).toBe(
    "みやきつん",
  );
});

it("refines table cells from source pixels and preserves full-sized kana", () => {
  const width = 400,
    height = 180,
    channels = 3;
  const data = new Uint8Array(width * height * channels);
  const paint = (x: number, y: number, w: number, h: number, value: number) => {
    for (let row = y; row < y + h; row++)
      for (let col = x; col < x + w; col++) {
        const offset = (row * width + col) * channels;
        data.fill(value, offset, offset + channels);
      }
  };
  for (let row = 0; row < 3; row++) {
    const y = 10 + row * 50;
    paint(40, y, 70, 40, 255);
    paint(115, y, 175, 40, 255);
    paint(310, y, 80, 40, 255);
    for (let index = 0; index < 5; index++) {
      const smallGlyph = row === 0 && (index === 1 || index === 3);
      paint(125 + index * 30, y + (smallGlyph ? 15 : 10), smallGlyph ? 18 : 24, smallGlyph ? 20 : 26, 0);
    }
  }
  const text = `<table>${[1, 2, 3].map((index) => `<tr><td>${index}</td><td>10:00~10:20</td><td>みやきつん</td><td>物販</td><td>A10:30~11:00</td></tr>`).join("")}</table>`;
  const result = refineTableKana(text, { width, height, channels, data }, { x: 0, y: 0, width, height });
  expect(result.match(/みゃきっん/gu)).toHaveLength(1);
  expect(result.match(/みやきつん/gu)).toHaveLength(2);
});
