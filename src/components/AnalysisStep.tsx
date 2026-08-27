import { AlertTriangle, BrainCircuit, Check, LoaderCircle, Square } from "lucide-react";

interface AnalysisStepProps {
  stage: "preparing" | "model" | "ocr" | "gemma" | "error";
  progress: number | null;
  message: string;
  error: string | null;
  onCancel: () => void;
  onManual: () => void;
  onRetry: () => void;
}

const steps = [
  ["model", "モデル取得"],
  ["ocr", "文字認識"],
  ["gemma", "データ整形"],
] as const;

export function AnalysisStep({
  stage,
  progress,
  message,
  error,
  onCancel,
  onManual,
  onRetry,
}: AnalysisStepProps) {
  const activeIndex = stage === "preparing" ? 0 : steps.findIndex(([key]) => key === stage);
  return (
    <main className="analysis-shell">
      <section className="analysis-card">
        <div className={`analysis-orb ${error ? "has-error" : ""}`}>
          {error ? <AlertTriangle size={34} /> : <BrainCircuit size={38} />}
        </div>
        <span className="eyebrow">03 / ANALYZE</span>
        <h1>{error ? "解析を完了できませんでした" : "画像を読み取っています"}</h1>
        <output className="analysis-message">{error ?? message}</output>
        {!error ? (
          <>
            <div className="progress-track">
              <span
                style={{ width: `${progress === null ? 35 : Math.max(4, progress * 100)}%` }}
                className={progress === null ? "indeterminate" : ""}
              />
            </div>
            <div className="analysis-steps">
              {steps.map(([key, label], index) => (
                <div
                  className={index < activeIndex ? "complete" : index === activeIndex ? "active" : ""}
                  key={key}
                >
                  <span>
                    {index < activeIndex ? (
                      <Check size={14} />
                    ) : index === activeIndex ? (
                      <LoaderCircle size={14} className="spin" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  {label}
                </div>
              ))}
            </div>
            <div className="info-box">
              初回はGLM-OCRとGemmaを合わせて約2.8GB取得します。時間は端末性能と回線速度によって変わります。
            </div>
            <button className="ghost-button" type="button" onClick={onCancel}>
              <Square size={13} /> 解析を中止
            </button>
          </>
        ) : (
          <div className="error-actions">
            <button className="ghost-button" type="button" onClick={onRetry}>
              もう一度試す
            </button>
            <button className="primary-button" type="button" onClick={onManual}>
              手入力で続ける
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
