import { expect, it } from "vitest";
import { planImageRegions } from "./image-regions";

it("covers a dense portrait timetable with overlapping full-width crops", () => {
  const regions = planImageRegions(1500, 2000);
  expect(regions.length).toBeGreaterThan(1);
  expect(regions[0]?.y).toBe(0);
  expect(regions.at(-1)!.y + regions.at(-1)!.height).toBe(2000);
  regions.forEach((region) => {
    expect(region.x).toBe(0);
    expect(region.width).toBe(1500);
    expect(region.height).toBeLessThanOrEqual(640);
  });
  regions.slice(1).forEach((region, index) => {
    expect(region.y).toBeLessThan(regions[index]!.y + regions[index]!.height);
  });
});

import { detectTableRegions } from "./image-regions";

it("recognizes regular table rows and separates the heading and shared footer", () => {
  const width = 320,
    height = 1500;
  const data = new Uint8Array(width * height * 3);
  for (let row = 0; row < 30; row++) {
    for (let y = 200 + row * 40; y < 230 + row * 40; y++) {
      for (let x = 40; x < 280; x++) {
        const offset = (y * width + x) * 3;
        data.fill(255, offset, offset + 3);
      }
    }
  }
  const regions = detectTableRegions(width, height, { data, channels: 3 });
  expect(regions).toHaveLength(12);
  expect(regions[0]?.kind).toBe("header");
  expect(regions.at(-1)?.kind).toBe("header");
  const tables = regions.filter((region) => region.kind === "column");
  expect(tables).toHaveLength(10);
  for (let row = 0; row < 30; row++) {
    expect(
      tables.filter((region) => region.y <= 200 + row * 40 && region.y + region.height >= 230 + row * 40),
    ).toHaveLength(1);
  }
});

it("falls back without guessing table rows on decorative images", () => {
  expect(detectTableRegions(100, 1500, { data: new Uint8Array(100 * 1500 * 3), channels: 3 })).toEqual(
    planImageRegions(100, 1500),
  );
});
