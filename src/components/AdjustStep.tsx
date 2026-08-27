import { RotateCcw, RotateCw, SlidersHorizontal, Undo2 } from "lucide-react";
import { defaultAdjustments, type ImageAdjustments } from "../lib/image";

interface AdjustStepProps {
  sourceUrl: string;
  adjustments: ImageAdjustments;
  onChange: (value: ImageAdjustments) => void;
  onBack: () => void;
  onAnalyze: () => void;
}

export function AdjustStep({ sourceUrl, adjustments, onChange, onBack, onAnalyze }: AdjustStepProps) {
  const setCrop = (side: keyof ImageAdjustments["crop"], value: number) => {
    const crop = { ...adjustments.crop, [side]: value };
    const horizontal = crop.left + crop.right;
    const vertical = crop.top + crop.bottom;
    if (horizontal <= 80 && vertical <= 80) onChange({ ...adjustments, crop });
  };

  return (
    <main className="workspace-shell">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">02 / ADJUST</span>
          <h1>画像を読みやすく整える</h1>
          <p>文字が水平になるように回転し、不要な余白を切り取ってください。</p>
        </div>
        <button className="ghost-button" type="button" onClick={() => onChange(defaultAdjustments)}>
          <Undo2 size={16} /> 元に戻す
        </button>
      </div>
      <div className="adjust-layout">
        <section className="preview-panel" aria-label="調整後の画像プレビュー">
          <div className="image-stage">
            <div
              className="crop-frame"
              style={{
                inset: `${adjustments.crop.top}% ${adjustments.crop.right}% ${adjustments.crop.bottom}% ${adjustments.crop.left}%`,
              }}
            />
            <img
              src={sourceUrl}
              alt="アップロードしたタイムテーブル"
              style={{
                transform: `rotate(${adjustments.rotation}deg)`,
                filter: `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%)`,
              }}
            />
          </div>
          <p>枠の外側は解析から除外されます</p>
        </section>
        <aside className="controls-panel">
          <div className="control-section">
            <h2>
              <RotateCw size={17} /> 回転
            </h2>
            <div className="button-pair">
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...adjustments,
                    rotation: ((adjustments.rotation + 270) % 360) as ImageAdjustments["rotation"],
                  })
                }
              >
                <RotateCcw size={17} /> 左へ90°
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...adjustments,
                    rotation: ((adjustments.rotation + 90) % 360) as ImageAdjustments["rotation"],
                  })
                }
              >
                <RotateCw size={17} /> 右へ90°
              </button>
            </div>
          </div>
          <div className="control-section">
            <h2>
              <SlidersHorizontal size={17} /> 明るさ・コントラスト
            </h2>
            <RangeControl
              label="明るさ"
              value={adjustments.brightness}
              min={50}
              max={150}
              suffix="%"
              onChange={(value) => onChange({ ...adjustments, brightness: value })}
            />
            <RangeControl
              label="コントラスト"
              value={adjustments.contrast}
              min={50}
              max={180}
              suffix="%"
              onChange={(value) => onChange({ ...adjustments, contrast: value })}
            />
          </div>
          <div className="control-section">
            <h2>切り抜き</h2>
            <div className="crop-grid">
              {(["top", "bottom", "left", "right"] as const).map((side) => (
                <RangeControl
                  key={side}
                  label={{ top: "上", bottom: "下", left: "左", right: "右" }[side]}
                  value={adjustments.crop[side]}
                  min={0}
                  max={40}
                  suffix="%"
                  onChange={(value) => setCrop(side, value)}
                />
              ))}
            </div>
          </div>
          <div className="action-row">
            <button className="ghost-button" type="button" onClick={onBack}>
              戻る
            </button>
            <button className="primary-button" type="button" onClick={onAnalyze}>
              解析を開始
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}

function RangeControl({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="range-control">
      <span>
        <span>{label}</span>
        <output>
          {value}
          {suffix}
        </output>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}
