import type { OcrProgress } from "@my-timetable/glm-ocr-web";
import type { GemmaProgress } from "./gemma";

export type AnalysisGemmaProgress = GemmaProgress;

export type AnalysisUpdate = ({ step: "ocr" } & OcrProgress) | ({ step: "gemma" } & AnalysisGemmaProgress);
