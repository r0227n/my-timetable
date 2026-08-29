import { useEffect, useRef, useState } from "react";
import { RotateCcw, RotateCw, SlidersHorizontal, Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { defaultAdjustments, fitImagePreview, type ImageAdjustments } from "../lib/image";

interface AdjustStepProps {
  sourceUrl: string;
  adjustments: ImageAdjustments;
  onChange: (value: ImageAdjustments) => void;
  onBack: () => void;
  onAnalyze: () => void;
}

export function AdjustStep({ sourceUrl, adjustments, onChange, onBack, onAnalyze }: AdjustStepProps) {
  const { t } = useTranslation("adjust");
  const { t: tCommon } = useTranslation("common");
  const stageRef = useRef<HTMLDivElement>(null);
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null);
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const updateSize = () => setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);
  const previewSize =
    sourceSize && stageSize ? fitImagePreview(sourceSize, stageSize, adjustments.rotation) : null;
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
          <h1>{t("heading")}</h1>
          <p>{t("description")}</p>
        </div>
        <button className="ghost-button" type="button" onClick={() => onChange(defaultAdjustments)}>
          <Undo2 size={16} /> {t("reset")}
        </button>
      </div>
      <div className="adjust-layout">
        <section className="preview-panel" aria-label={t("previewLabel")}>
          <div className="image-stage" ref={stageRef}>
            <div
              className="image-preview"
              style={{
                width: previewSize?.width,
                height: previewSize?.height,
                transform: `rotate(${adjustments.rotation}deg)`,
              }}
            >
              <img
                src={sourceUrl}
                alt={t("imageAlt")}
                onLoad={(event) =>
                  setSourceSize({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  })
                }
                style={{
                  filter: `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%)`,
                }}
              />
              <div
                className="crop-frame"
                style={{
                  inset: `${adjustments.crop.top}% ${adjustments.crop.right}% ${adjustments.crop.bottom}% ${adjustments.crop.left}%`,
                }}
              />
            </div>
          </div>
          <p>{t("outsideCrop")}</p>
        </section>
        <aside className="controls-panel">
          <div className="control-section">
            <h2>
              <RotateCw size={17} /> {t("rotation")}
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
                <RotateCcw size={17} /> {t("rotateLeft")}
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
                <RotateCw size={17} /> {t("rotateRight")}
              </button>
            </div>
          </div>
          <div className="control-section">
            <h2>
              <SlidersHorizontal size={17} /> {t("brightnessContrast")}
            </h2>
            <RangeControl
              label={t("brightness")}
              value={adjustments.brightness}
              min={50}
              max={150}
              suffix="%"
              onChange={(value) => onChange({ ...adjustments, brightness: value })}
            />
            <RangeControl
              label={t("contrast")}
              value={adjustments.contrast}
              min={50}
              max={180}
              suffix="%"
              onChange={(value) => onChange({ ...adjustments, contrast: value })}
            />
          </div>
          <div className="control-section">
            <h2>{t("crop")}</h2>
            <div className="crop-grid">
              {(["top", "bottom", "left", "right"] as const).map((side) => (
                <RangeControl
                  key={side}
                  label={t(side)}
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
              {tCommon("back")}
            </button>
            <button className="primary-button" type="button" onClick={onAnalyze}>
              {t("start")}
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
