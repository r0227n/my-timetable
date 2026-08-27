import { describe, expect, it, vi } from "vitest";
import { GLM_CACHE_NAME } from "@my-timetable/glm-ocr-web";
import { modelConfig } from "./model-config";
import { clearAllModelCaches } from "./model-cache";

describe("model cache settings", () => {
  it("deletes both OCR and Gemma model caches", async () => {
    const remove = vi.fn<(cacheName: string) => Promise<boolean>>(async () => true);
    vi.stubGlobal("caches", { delete: remove });

    await clearAllModelCaches();

    expect(remove).toHaveBeenCalledWith(GLM_CACHE_NAME);
    expect(remove).toHaveBeenCalledWith(modelConfig.structuring.cacheName);
  });
});
