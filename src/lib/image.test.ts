import { describe, expect, it } from "vitest";
import { fitImagePreview, maxFileSize, validateImageFile } from "./image";

describe("validateImageFile", () => {
  it("accepts supported image types", () => {
    expect(validateImageFile({ type: "image/png", size: 1024 } as File)).toBeNull();
  });

  it("rejects unsupported types and oversized images", () => {
    expect(validateImageFile({ type: "image/heic", size: 1024 } as File)).toContain("JPEG");
    expect(validateImageFile({ type: "image/png", size: maxFileSize + 1 } as File)).toContain("20MB");
  });
});

describe("fitImagePreview", () => {
  it("fits the rotated bounds while preserving the source coordinate box", () => {
    expect(fitImagePreview({ width: 1200, height: 800 }, { width: 900, height: 600 }, 90)).toEqual({
      width: 540,
      height: 360,
    });
  });
});
