import { isLightTablePixel } from "./raster";
import type { OcrTextRegion } from "./types";

/** Full-width overlapping bands keep a performer's time/name/booth columns together. */
export function planImageRegions(width: number, height: number): OcrTextRegion["region"][] {
  if (height <= 1280) return [{ x: 0, y: 0, width, height }];
  const bandHeight = Math.min(640, Math.max(320, Math.round(width * 0.36)));
  const overlap = Math.round(bandHeight * 0.18);
  const regions: OcrTextRegion["region"][] = [];
  for (let y = 0; y < height; y += bandHeight - overlap) {
    regions.push({ x: 0, y, width, height: Math.min(bandHeight, height - y) });
    if (y + bandHeight >= height) break;
  }
  return regions;
}

interface Pixels {
  data: Uint8Array | Uint8ClampedArray;
  channels: number;
}
export type PlannedRegion = OcrTextRegion["region"] & { kind?: "header" | "column" };

/** Detect repeated light table rows before falling back to overlapping bands. */
export function detectTableRegions(width: number, height: number, pixels?: Pixels): PlannedRegion[] {
  if (!pixels || height <= 1280) return planImageRegions(width, height);
  const { data, channels } = pixels;
  const white = (x: number, y: number) => {
    const offset = (y * width + x) * channels;
    return isLightTablePixel(data, offset);
  };
  const runs: Array<{ start: number; end: number }> = [];
  let start: number | null = null;
  for (let y = 0; y <= height; y++) {
    let count = 0,
      samples = 0;
    if (y < height)
      for (let x = Math.round(width * 0.15); x < width * 0.9; x += 3) {
        count += Number(white(x, y));
        samples++;
      }
    if (samples && count / samples > 0.45) {
      start ??= y;
    } else if (start !== null) {
      if (y - start >= 12) runs.push({ start, end: y });
      start = null;
    }
  }
  if (runs.length < 6) return planImageRegions(width, height);
  const heights = runs.map((run) => run.end - run.start).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)]!;
  if (
    runs.some((run) => run.end - run.start < median * 0.65 || run.end - run.start > median * 1.5) ||
    runs.some((run, index) => index > 0 && run.start - runs[index - 1]!.end > median)
  )
    return planImageRegions(width, height);
  let left = width,
    right = 0;
  for (let x = 0; x < width; x++) {
    if (runs.filter((run) => white(x, run.start + 2)).length > runs.length * 0.6) {
      left = Math.min(left, x);
      right = x;
    }
  }
  if (right - left < width * 0.5) return planImageRegions(width, height);
  left = Math.max(0, left - Math.round(width * 0.04));
  right = Math.min(width, right + Math.round(width * 0.008));
  const regions: PlannedRegion[] = [];
  const firstY = Math.max(0, runs[0]!.start - 5);
  if (firstY > 30) regions.push({ x: 0, y: 0, width, height: firstY, kind: "header" });
  for (let index = 0; index < runs.length; index += 3) {
    const y = Math.max(0, runs[index]!.start - 4);
    const end = Math.min(height, runs[Math.min(index + 2, runs.length - 1)]!.end + 4);
    regions.push({ x: left, y, width: right - left, height: end - y, kind: "column" });
  }
  const footerY = runs.at(-1)!.end + 4;
  if (height - footerY > 15)
    regions.push({ x: 0, y: footerY, width, height: height - footerY, kind: "header" });
  return regions;
}
