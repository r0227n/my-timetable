import { OCR_ENGINES } from "@my-timetable/glm-ocr-web";
import type { GemmaModelId } from "./gemma-model";

const sharedStructuringConfig = {
  source: "Hugging Face",
  runtimeUrl: "https://cdn.jsdelivr.net/npm/@litert-lm/core@0.15.0/wasm/",
  cacheName: "my-timetable-models-v1",
} as const;

export const gemmaModels: Record<
  GemmaModelId,
  typeof sharedStructuringConfig & {
    id: GemmaModelId;
    shortName: string;
    name: string;
    approximateSize: string;
    url: string;
  }
> = {
  e2b: {
    ...sharedStructuringConfig,
    id: "e2b",
    shortName: "Gemma 4 E2B",
    name: "Gemma 4 E2B (LiteRT-LM Web)",
    approximateSize: "2.01 GB",
    url: "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm",
  },
  e4b: {
    ...sharedStructuringConfig,
    id: "e4b",
    shortName: "Gemma 4 E4B",
    name: "Gemma 4 E4B (LiteRT-LM Web)",
    approximateSize: "2.97 GB",
    url: "https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it-web.litertlm",
  },
};

export const modelConfig = {
  ocr: OCR_ENGINES[0],
  structuring: gemmaModels.e2b,
} as const;
