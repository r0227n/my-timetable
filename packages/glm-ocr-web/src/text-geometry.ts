import { isLightTablePixel } from "./raster";
interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface Pixels {
  width: number;
  height: number;
  channels: number;
  data: Uint8Array | Uint8ClampedArray;
}
const smallKana: Record<string, string> = {
  つ: "っ",
  や: "ゃ",
  ゆ: "ゅ",
  よ: "ょ",
  ツ: "ッ",
  ヤ: "ャ",
  ユ: "ュ",
  ヨ: "ョ",
};

/** Only change kana when separated glyphs provide matching geometric evidence. */
export function restoreSmallKana(text: string, glyphs: Bounds[]): string {
  const characters = [...text];
  if (characters.length !== glyphs.length) return text;
  const reference = glyphs.filter(
    (_, index) =>
      /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(characters[index]!) && !smallKana[characters[index]!],
  );
  if (reference.length < 3) return text;
  const median = (values: number[]) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)]!;
  const width = median(reference.map((glyph) => glyph.width));
  const height = median(reference.map((glyph) => glyph.height));
  const top = median(reference.map((glyph) => glyph.y));
  return characters
    .map((character, index) => {
      const glyph = glyphs[index]!;
      return smallKana[character] &&
        glyph.width < width * 0.86 &&
        glyph.height < height * 0.88 &&
        glyph.y > top + height * 0.1
        ? smallKana[character]
        : character;
    })
    .join("");
}

/** Refine small-kana typography only in a clearly detected five-cell timetable row. */
export function refineTableKana(text: string, image: Pixels | undefined, region: Bounds): string {
  if (!image || !/[つやゆよツヤユヨ]/u.test(text)) return text;
  const rows = [...text.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)];
  if (!rows.length) return text;
  const isWhite = (x: number, y: number) => {
    const offset = (y * image.width + x) * image.channels;
    return isLightTablePixel(image.data, offset);
  };
  const whiteRows: Array<{ start: number; end: number }> = [];
  let start: number | null = null;
  for (let y = region.y; y <= region.y + region.height; y++) {
    let white = 0,
      total = 0;
    if (y < region.y + region.height)
      for (let x = region.x; x < region.x + region.width; x += 3) {
        white += Number(isWhite(x, y));
        total++;
      }
    if (total && white / total > 0.45) start ??= y;
    else if (start !== null) {
      if (y - start >= 12) whiteRows.push({ start, end: y });
      start = null;
    }
  }
  if (whiteRows.length !== rows.length) return text;
  let result = text;
  rows.forEach((row, index) => {
    const cells = [...row[0].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/giu)];
    if (cells.length !== 5 || !/^\d+$/u.test(cells[0]![1]!) || !/^(?:物販|特典会)$/u.test(cells[3]![1]!))
      return;
    const name = cells[2]![1]!;
    if (!/[つやゆよツヤユヨ]/u.test(name) || /[<&\s]/u.test(name)) return;
    const line = whiteRows[index]!;
    const columns: Array<{ start: number; end: number }> = [];
    let columnStart: number | null = null;
    for (let x = region.x; x <= region.x + region.width; x++) {
      if (x < region.x + region.width && isWhite(x, line.start + 2)) columnStart ??= x;
      else if (columnStart !== null) {
        if (x - columnStart > 20) columns.push({ start: columnStart, end: x });
        columnStart = null;
      }
    }
    if (columns.length !== 3) return;
    const column = columns[1]!;
    if (
      column.end - column.start <
      Math.max(columns[0]!.end - columns[0]!.start, columns[2]!.end - columns[2]!.start)
    )
      return;
    const glyphs: Bounds[] = [];
    let glyphStart: number | null = null,
      top = line.end,
      bottom = line.start;
    for (let x = column.start + 2; x <= column.end - 2; x++) {
      let ink = false;
      if (x < column.end - 2)
        for (let y = line.start + 2; y < line.end - 2; y++) {
          const offset = (y * image.width + x) * image.channels;
          if (Math.max(image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!) < 110) {
            ink = true;
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
        }
      if (ink) glyphStart ??= x;
      else if (glyphStart !== null) {
        glyphs.push({ x: glyphStart, y: top, width: x - glyphStart, height: bottom - top + 1 });
        glyphStart = null;
        top = line.end;
        bottom = line.start;
      }
    }
    const corrected = restoreSmallKana(name, glyphs);
    if (corrected !== name)
      result = result.replace(row[0], row[0].replace(cells[2]![0], cells[2]![0].replace(name, corrected)));
  });
  return result;
}
