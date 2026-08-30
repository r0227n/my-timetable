import type { ImageAdjustments } from "./image";

export const minimumCropSize = 20;

export type Crop = ImageAdjustments["crop"];
export type CropHandle = "move" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

type Rect = { x: number; y: number; width: number; height: number };

export function cropToRect(crop: Crop): Rect {
  return {
    x: crop.left,
    y: crop.top,
    width: 100 - crop.left - crop.right,
    height: 100 - crop.top - crop.bottom,
  };
}

export function rectToCrop(rect: Rect): Crop {
  return {
    top: rect.y,
    right: 100 - rect.x - rect.width,
    bottom: 100 - rect.y - rect.height,
    left: rect.x,
  };
}

export function updateCrop(crop: Crop, handle: CropHandle, dx: number, dy: number): Crop {
  const rect = cropToRect(crop);
  if (handle === "move") {
    return rectToCrop({
      ...rect,
      x: clamp(rect.x + dx, 0, 100 - rect.width),
      y: clamp(rect.y + dy, 0, 100 - rect.height),
    });
  }

  let left = rect.x;
  let right = rect.x + rect.width;
  let top = rect.y;
  let bottom = rect.y + rect.height;

  if (handle.includes("w")) left = clamp(left + dx, 0, right - minimumCropSize);
  if (handle.includes("e")) right = clamp(right + dx, left + minimumCropSize, 100);
  if (handle.includes("n")) top = clamp(top + dy, 0, bottom - minimumCropSize);
  if (handle.includes("s")) bottom = clamp(bottom + dy, top + minimumCropSize, 100);

  return rectToCrop({ x: left, y: top, width: right - left, height: bottom - top });
}

export function screenDeltaToImagePercent(
  dx: number,
  dy: number,
  size: { width: number; height: number },
  rotation: ImageAdjustments["rotation"],
): { dx: number; dy: number } {
  if (rotation === 90) return { dx: (dy / size.width) * 100, dy: (-dx / size.height) * 100 };
  if (rotation === 180) return { dx: (-dx / size.width) * 100, dy: (-dy / size.height) * 100 };
  if (rotation === 270) return { dx: (-dy / size.width) * 100, dy: (dx / size.height) * 100 };
  return { dx: (dx / size.width) * 100, dy: (dy / size.height) * 100 };
}

export function screenStepToImagePercent(
  dx: number,
  dy: number,
  rotation: ImageAdjustments["rotation"],
): { dx: number; dy: number } {
  if (rotation === 90) return { dx: dy, dy: -dx };
  if (rotation === 180) return { dx: -dx, dy: -dy };
  if (rotation === 270) return { dx: -dy, dy: dx };
  return { dx, dy };
}

export function handleCursor(handle: CropHandle, rotation: ImageAdjustments["rotation"]): string {
  if (handle === "move") return "move";
  const directions = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;
  const index = directions.indexOf(handle);
  const rotated = directions[(index + rotation / 45) % directions.length];
  return `${rotated}-resize`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
