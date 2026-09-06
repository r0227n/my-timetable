export function isLightTablePixel(data: Uint8Array | Uint8ClampedArray, offset: number): boolean {
  const r = data[offset]!,
    g = data[offset + 1]!,
    b = data[offset + 2]!;
  return Math.min(r, g, b) > 230 && Math.max(r, g, b) - Math.min(r, g, b) < 18;
}
