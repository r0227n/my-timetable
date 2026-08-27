import { describe, expect, it } from "vitest";
import { maxFileSize, validateImageFile } from "./image";

describe("validateImageFile", () => {
  it("accepts supported image types", () => {
    expect(validateImageFile({ type: "image/png", size: 1024 } as File)).toBeNull();
  });

  it("rejects unsupported types and oversized images", () => {
    expect(validateImageFile({ type: "image/heic", size: 1024 } as File)).toBe("imageInvalidType");
    expect(validateImageFile({ type: "image/png", size: maxFileSize + 1 } as File)).toBe("imageTooLarge");
  });
});
