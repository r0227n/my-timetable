import { Check } from "lucide-react";

const steps = ["画像", "調整", "解析", "確認", "選択", "編集", "出力"];

export function StepNav({ current }: { current: number }) {
  return (
    <nav className="step-nav" aria-label="作成ステップ">
      {steps.map((label, index) => (
        <div
          className={`step ${index === current ? "current" : ""} ${index < current ? "done" : ""}`}
          key={label}
          aria-current={index === current ? "step" : undefined}
        >
          <span className="step-dot">{index < current ? <Check size={13} /> : index + 1}</span>
          <span>{label}</span>
        </div>
      ))}
    </nav>
  );
}
