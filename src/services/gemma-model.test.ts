import { beforeEach, describe, expect, it } from "vitest";
import {
  gemmaModelStorageKey,
  getE4BAvailability,
  resolveStoredGemmaModel,
  storeGemmaModel,
} from "./gemma-model";

describe("getE4BAvailability", () => {
  it("requires WebGPU and at least 8 GB of reported device memory", () => {
    expect(getE4BAvailability({ gpu: undefined, deviceMemory: 8 })).toEqual({
      available: false,
      reason: "webgpu",
    });
    expect(getE4BAvailability({ gpu: {}, deviceMemory: undefined })).toEqual({
      available: false,
      reason: "memory-unknown",
    });
    expect(getE4BAvailability({ gpu: {}, deviceMemory: 4 })).toEqual({
      available: false,
      reason: "memory",
    });
    expect(getE4BAvailability({ gpu: {}, deviceMemory: 8 })).toEqual({ available: true, reason: null });
  });
});

describe("stored Gemma model", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to E2B and restores an available E4B selection", () => {
    expect(resolveStoredGemmaModel({ available: true, reason: null })).toBe("e2b");
    storeGemmaModel("e4b");
    expect(localStorage.getItem(gemmaModelStorageKey)).toBe("e4b");
    expect(resolveStoredGemmaModel({ available: true, reason: null })).toBe("e4b");
  });

  it("falls back from a stored E4B selection when it is unavailable", () => {
    localStorage.setItem(gemmaModelStorageKey, "e4b");
    expect(resolveStoredGemmaModel({ available: false, reason: "memory" })).toBe("e2b");
  });
});
