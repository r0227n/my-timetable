export const gemmaModelStorageKey = "ui.gemmaModel";

export type GemmaModelId = "e2b" | "e4b";

export interface GemmaModelAvailability {
  available: boolean;
  reason: "webgpu" | "memory" | "memory-unknown" | null;
}

export const minimumE4BDeviceMemoryGb = 8;

export function getE4BAvailability(
  capabilities: Pick<Navigator, "gpu" | "deviceMemory"> = navigator,
): GemmaModelAvailability {
  if (!capabilities.gpu) return { available: false, reason: "webgpu" };
  if (capabilities.deviceMemory === undefined) return { available: false, reason: "memory-unknown" };
  if (capabilities.deviceMemory < minimumE4BDeviceMemoryGb) return { available: false, reason: "memory" };
  return { available: true, reason: null };
}

export function resolveStoredGemmaModel(availability: GemmaModelAvailability): GemmaModelId {
  return localStorage.getItem(gemmaModelStorageKey) === "e4b" && availability.available ? "e4b" : "e2b";
}

export function storeGemmaModel(model: GemmaModelId): void {
  localStorage.setItem(gemmaModelStorageKey, model);
}
