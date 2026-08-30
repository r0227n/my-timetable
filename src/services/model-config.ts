import { OCR_ENGINES } from "@my-timetable/glm-ocr-web";

export const modelConfig = {
  ocr: OCR_ENGINES[0],
  structuring: {
    name: "Gemma 4 E2B (LiteRT-LM Web)",
    approximateSize: "2.01 GB",
    source: "Hugging Face",
    url: "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm",
    runtimeUrl: "https://cdn.jsdelivr.net/npm/@litert-lm/core@0.15.0/wasm/",
    cacheName: "my-timetable-models-v1",
  },
} as const;
