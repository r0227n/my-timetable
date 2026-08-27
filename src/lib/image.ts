export interface ImageAdjustments {
  rotation: 0 | 90 | 180 | 270;
  brightness: number;
  contrast: number;
  crop: { top: number; right: number; bottom: number; left: number };
}

export const defaultAdjustments: ImageAdjustments = {
  rotation: 0,
  brightness: 100,
  contrast: 100,
  crop: { top: 0, right: 0, bottom: 0, left: 0 },
};

export const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
export const maxFileSize = 20 * 1024 * 1024;

export function validateImageFile(file: File): AppErrorCode | null {
  if (!acceptedImageTypes.has(file.type)) return "imageInvalidType";
  if (file.size > maxFileSize) return "imageTooLarge";
  return null;
}

export async function renderAdjustedImage(
  sourceUrl: string,
  adjustments: ImageAdjustments,
  maxLongEdge = 4096,
): Promise<Blob> {
  const image = await loadImage(sourceUrl);
  const { top, right, bottom, left } = adjustments.crop;
  const sx = image.naturalWidth * (left / 100);
  const sy = image.naturalHeight * (top / 100);
  const sw = image.naturalWidth * (1 - (left + right) / 100);
  const sh = image.naturalHeight * (1 - (top + bottom) / 100);
  const rotated = adjustments.rotation === 90 || adjustments.rotation === 270;
  const rawWidth = rotated ? sh : sw;
  const rawHeight = rotated ? sw : sh;
  const scale = Math.min(1, maxLongEdge / Math.max(rawWidth, rawHeight));

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(rawWidth * scale));
  canvas.height = Math.max(1, Math.round(rawHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new AppError("imageProcessFailed");

  context.filter = `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%)`;
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((adjustments.rotation * Math.PI) / 180);
  context.drawImage(image, sx, sy, sw, sh, (-sw * scale) / 2, (-sh * scale) / 2, sw * scale, sh * scale);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new AppError("imageGenerateFailed"))),
      "image/png",
    );
  });
}

function loadImage(sourceUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new AppError("imageLoadFailed"));
    image.src = sourceUrl;
  });
}
import { AppError, type AppErrorCode } from "../domain/errors";
