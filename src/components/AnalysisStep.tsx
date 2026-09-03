import { AlertTriangle, BrainCircuit, Check, LoaderCircle, Square } from "lucide-react";
import { useTranslation } from "react-i18next";
import { analysisPublicCode, type AnalysisFailure } from "../domain/analysis-error";
import { AppError } from "../domain/errors";
import { localizeError } from "../i18n/errors";

interface AnalysisStepProps {
  stage: "preparing" | "model" | "ocr" | "gemma" | "error";
  progress: number | null;
  failure: AnalysisFailure | null;
  onCancel: () => void;
  onManual: () => void;
  onRetry: () => void;
  onBackToAdjust: () => void;
}

const steps = ["model", "ocr", "gemma"] as const;

export function AnalysisStep({
  stage,
  progress,
  failure,
  onCancel,
  onManual,
  onRetry,
  onBackToAdjust,
}: AnalysisStepProps) {
  const { t } = useTranslation("analysis");
  const error = failure ? localizeError(new AppError(failure.code), "analysisFailed") : null;
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
        {failure ? <p className="analysis-error-stage">{t(`errorStages.${failure.stage}`)}</p> : null}
        <output className="analysis-message">{message}</output>
        {!error ? (
          <>
            <div className="progress-track">
              <span
                style={{ width: `${progress === null ? 35 : Math.max(4, progress * 100)}%` }}
                className={progress === null ? "indeterminate" : ""}
              />
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
          <>
            <p className="analysis-error-code">
              <span>{t("errorCodeLabel")}:</span> <code>{analysisPublicCode(failure!.code)}</code>
            </p>
            <div className="error-actions">
              {failure!.retryTarget !== "none" ? (
                <button className="ghost-button" type="button" onClick={onRetry}>
                  {t(`retryActions.${failure!.retryTarget}`)}
                </button>
              ) : null}
              {failure!.stage === "ocr" || failure!.stage === "image" ? (
                <button className="ghost-button" type="button" onClick={onBackToAdjust}>
                  {t("backToAdjust")}
                </button>
              ) : null}
              {failure!.canContinueManually ? (
                <button className="primary-button" type="button" onClick={onManual}>
                  {t("manual")}
                </button>
              ) : null}
            </div>
            <details className="analysis-diagnostics">
              <summary>{t("showDiagnostics")}</summary>
              <pre>{failure!.diagnostics}</pre>
              <button
                className="ghost-button"
                type="button"
                onClick={() => void navigator.clipboard.writeText(failure!.diagnostics)}
              >
                {t("copyDiagnostics")}
              </button>
            </details>
          </>
        )}
      </section>
    </main>
  );
}
