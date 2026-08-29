import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";

const steps = ["image", "adjust", "analysis", "review", "selection", "timeline", "export"] as const;

export function StepNav({ current }: { current: number }) {
  const { t } = useTranslation("common");
  return (
    <nav className="step-nav" aria-label={t("steps.label")}>
      {steps.map((key, index) => (
        <div
          className={`step ${index === current ? "current" : ""} ${index < current ? "done" : ""}`}
          key={key}
          aria-current={index === current ? "step" : undefined}
        >
          <span className="step-dot">{index < current ? <Check size={13} /> : index + 1}</span>
          <span>{t(`steps.${key}`)}</span>
        </div>
      ))}
    </nav>
  );
}
