import { describe, expect, it } from "vitest";
import {
  cropToRect,
  handleCursor,
  screenDeltaToImagePercent,
  screenStepToImagePercent,
  updateCrop,
} from "./crop";

const full = { top: 0, right: 0, bottom: 0, left: 0 };

describe("updateCrop", () => {
  it("moves the crop rectangle and clamps it inside the image", () => {
    const crop = { top: 10, right: 50, bottom: 50, left: 10 };
    expect(cropToRect(updateCrop(crop, "move", 80, -20))).toEqual({
      x: 60,
      y: 0,
      width: 40,
      height: 40,
    });
  });

  it("resizes each edge and corner", () => {
    expect(cropToRect(updateCrop(full, "se", -25, -30))).toEqual({
      x: 0,
      y: 0,
      width: 75,
      height: 70,
    });
    expect(cropToRect(updateCrop(full, "nw", 10, 15))).toEqual({
      x: 10,
      y: 15,
      width: 90,
      height: 85,
    });
  });

  it("keeps both dimensions at least 20 percent", () => {
    expect(cropToRect(updateCrop(full, "nw", 99, 99))).toEqual({
      x: 80,
      y: 80,
      width: 20,
      height: 20,
    });
  });
});

describe("rotated pointer coordinates", () => {
  it("maps screen movement back to original image coordinates", () => {
    expect(screenDeltaToImagePercent(0, 20, { width: 200, height: 100 }, 90)).toEqual({
      dx: 10,
      dy: -0,
    });
    expect(screenDeltaToImagePercent(10, 0, { width: 200, height: 100 }, 270)).toEqual({
      dx: -0,
      dy: 10,
    });
  });

  it("rotates resize cursors with the preview", () => {
    expect(handleCursor("n", 90)).toBe("e-resize");
    expect(handleCursor("nw", 270)).toBe("sw-resize");
  });

  it("maps keyboard directions to original image coordinates", () => {
    expect(screenStepToImagePercent(5, 0, 90)).toEqual({ dx: 0, dy: -5 });
    expect(screenStepToImagePercent(0, -1, 270)).toEqual({ dx: 1, dy: 0 });
  });
});
