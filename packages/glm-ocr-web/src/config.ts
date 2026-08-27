import type { OcrEngineInfo } from "./types";

export const GLM_MODEL_ID = "onnx-community/GLM-OCR-ONNX";
export const GLM_MODEL_REVISION = "aea46198f09e3aa2b63422dd234f1cc66afffe52";
export const GLM_CACHE_NAME = "transformers-cache";
export const GLM_EXTERNAL_DATA = {
  embed_tokens: true,
  decoder_model_merged: true,
  vision_encoder: true,
} as const;

export const OCR_ENGINES: readonly OcrEngineInfo[] = [
  {
    kind: "glm-ocr",
    name: "GLM-OCR ONNX (WebGPU)",
    approximateSize: "約750 MB",
    source: "Hugging Face / ONNX Community",
    available: true,
    note: "画像を外部送信せず、ブラウザ内のWebGPUで実行します。",
  },
] as const;
