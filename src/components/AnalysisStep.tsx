import { AlertTriangle, BrainCircuit, Check, LoaderCircle, Square } from "lucide-react";
import { useTranslation } from "react-i18next";

interface AnalysisStepProps {
  stage: "preparing" | "model" | "ocr" | "gemma" | "error";
  progress: number | null;
  error: string | null;
  onCancel: () => void;
  onManual: () => void;
  onRetry: () => void;
}

const steps = ["model", "ocr", "gemma"] as const;

export function AnalysisStep({ stage, progress, error, onCancel, onManual, onRetry }: AnalysisStepProps) {
  const { t } = useTranslation("analysis");
  const activeIndex = stage === "preparing" ? 0 : steps.findIndex((key) => key === stage);
  const message =
    error ??
    t(
      stage === "preparing"
        ? "preparing"
        : stage === "model"
          ? "modelMessage"
          : stage === "ocr"
            ? "ocrMessage"
            : "gemmaMessage",
    );
  return (
    <main className="analysis-shell">
      <section className="analysis-card">
        <div className={`analysis-orb ${error ? "has-error" : ""}`}>
          {error ? <AlertTriangle size={34} /> : <BrainCircuit size={38} />}
        </div>
        <span className="eyebrow">03 / ANALYZE</span>
        <h1>{error ? t("failedHeading") : t("heading")}</h1>
        <output className="analysis-message" aria-live="polite" aria-atomic="true">
          {message}
        </output>
        {!error ? (
          <>
            <div className="progress-track">
              <progress aria-label={message} max={1} value={progress ?? undefined} />
            </div>
            <div className="analysis-steps">
              {steps.map((key, index) => (
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
                  {t(`steps.${key}`)}
                </div>
              ))}
            </div>
            <div className="info-box">{t("downloadInfo")}</div>
            <button className="ghost-button" type="button" onClick={onCancel}>
              <Square size={13} /> {t("cancel")}
            </button>
          </>
        ) : (
          <div className="error-actions">
            <button className="ghost-button" type="button" onClick={onRetry}>
              {t("retry")}
            </button>
            <button className="primary-button" type="button" onClick={onManual}>
              {t("manual")}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
