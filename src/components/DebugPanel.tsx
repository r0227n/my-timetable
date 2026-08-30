import { useEffect, useRef, useState } from "react";
import type { OcrProgress, OcrResult } from "@my-timetable/glm-ocr-web";
import { X } from "lucide-react";
import { localizeError } from "../i18n/errors";
import { recognizeImage } from "../services/analysis";
import { structureWithGemma } from "../services/gemma";

interface DebugPanelProps {
  onClose: () => void;
}

export function DebugPanel({ onClose }: DebugPanelProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [ocrJson, setOcrJson] = useState("");
  const [gemmaInput, setGemmaInput] = useState("");
  const [gemmaJson, setGemmaJson] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [running, setRunning] = useState<"ocr" | "gemma" | null>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
    return () => controllerRef.current?.abort();
  }, []);

  const begin = (kind: "ocr" | "gemma") => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setRunning(kind);
    setError("");
    return controller;
  };

  const finish = () => {
    controllerRef.current = null;
    setRunning(null);
  };

  const runOcr = async () => {
    if (!image) return;
    const controller = begin("ocr");
    try {
      const result = await recognizeImage(
        image,
        (progress: OcrProgress) => setStatus(`OCR: ${progress.stage} ${formatProgress(progress.progress)}`),
        controller.signal,
      );
      const resultJson = JSON.stringify(result, null, 2);
      setOcrJson(resultJson);
      setGemmaInput(resultJson);
      setStatus("OCR: 完了");
    } catch (nextError) {
      if (!controller.signal.aborted) setError(describeDebugError(nextError));
    } finally {
      finish();
    }
  };

  const runGemma = async () => {
    const controller = begin("gemma");
    try {
      const input = parseOcrResult(gemmaInput);
      const result = await structureWithGemma(
        input,
        ({ progress }) => setStatus(`Gemma: ${formatProgress(progress)}`),
        controller.signal,
      );
      setGemmaJson(JSON.stringify(result, null, 2));
      setStatus("Gemma: 完了");
    } catch (nextError) {
      if (!controller.signal.aborted) setError(describeDebugError(nextError));
    } finally {
      finish();
    }
  };

  return (
    <dialog ref={dialogRef} className="debug-dialog" onClose={onClose}>
      <div className="debug-dialog-inner">
        <div className="debug-dialog-header">
          <div>
            <h1>AIデバッグ</h1>
            <p>OCRとGemmaを個別に実行し、中間データを確認できます。</p>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="閉じる"
          >
            <X size={18} />
          </button>
        </div>
        <div className="debug-grid">
          <section className="debug-section">
            <h2>1. GLM-OCR</h2>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => setImage(event.target.files?.[0] ?? null)}
              aria-label="OCR画像"
            />
            <div className="debug-section-actions">
              <span>{image?.name ?? "画像未選択"}</span>
              <button type="button" onClick={() => void runOcr()} disabled={!image || running !== null}>
                OCRを実行
              </button>
            </div>
            <textarea
              aria-label="OCR結果JSON"
              value={ocrJson}
              onChange={(event) => setOcrJson(event.target.value)}
              placeholder="OCR結果、またはGemmaへ渡すOcrResult JSON"
            />
          </section>
          <section className="debug-section">
            <h2>2. Gemma</h2>
            <p>OCR結果JSONを貼り付け・編集して、Gemmaだけを実行できます。</p>
            <button
              type="button"
              onClick={() => void runGemma()}
              disabled={!gemmaInput.trim() || running !== null}
            >
              Gemmaを実行
            </button>
            <textarea
              aria-label="Gemma入力JSON"
              value={gemmaInput}
              onChange={(event) => setGemmaInput(event.target.value)}
              placeholder="Gemmaへ渡すOcrResult JSON"
            />
            <textarea aria-label="Gemma結果JSON" value={gemmaJson} readOnly placeholder="構造化結果" />
          </section>
        </div>
        <output className={`debug-status ${error ? "debug-error" : ""}`}>{error || status}</output>
        {running ? (
          <button type="button" onClick={() => controllerRef.current?.abort()}>
            実行を中止
          </button>
        ) : null}
      </div>
    </dialog>
  );
}

function formatProgress(progress: number | null): string {
  return progress === null ? "処理中" : `${Math.round(progress * 100)}%`;
}

function parseOcrResult(value: string): OcrResult {
  const parsed: unknown = JSON.parse(value);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("text" in parsed) ||
    !("regions" in parsed) ||
    !Array.isArray(parsed.regions)
  ) {
    throw new Error("OcrResult形式のJSONを入力してください。");
  }
  return parsed as OcrResult;
}

function describeDebugError(error: unknown): string {
  if (error instanceof SyntaxError) return `JSONを解析できません: ${error.message}`;
  if (error instanceof Error && error.message) return error.message;
  return localizeError(error, "analysisFailed");
}
