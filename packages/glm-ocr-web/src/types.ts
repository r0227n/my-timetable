export type OcrEngineKind = "glm-ocr";

export interface OcrProgress {
  stage: "model" | "recognition";
  progress: number | null;
  message: string;
}

export interface OcrResult {
  text: string;
  engine: OcrEngineKind;
  regions: OcrTextRegion[];
}

export interface OcrTextRegion {
  text: string;
  order: number;
  confidence: number | null;
  region: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface OcrEngine {
  readonly kind: OcrEngineKind;
  recognize(
    image: Blob,
    onProgress: (progress: OcrProgress) => void,
    signal: AbortSignal,
  ): Promise<OcrResult>;
  dispose(): Promise<void>;
}

export interface OcrEngineInfo {
  kind: OcrEngineKind;
  name: string;
  approximateSize: string;
  source: string;
  available: boolean;
  note: string;
}
