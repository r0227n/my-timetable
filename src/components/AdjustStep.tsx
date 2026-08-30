import { useEffect, useRef, useState } from "react";
import { RotateCcw, RotateCw, SlidersHorizontal, Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  handleCursor,
  screenDeltaToImagePercent,
  screenStepToImagePercent,
  updateCrop,
  type CropHandle,
} from "../lib/crop";
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
              {previewSize ? (
                <CropOverlay adjustments={adjustments} previewSize={previewSize} onChange={onChange} />
              ) : null}
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
            <p className="crop-instructions">{t("cropInstructions")}</p>
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

const cropHandles = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;

function CropOverlay({
  adjustments,
  previewSize,
  onChange,
}: {
  adjustments: ImageAdjustments;
  previewSize: { width: number; height: number };
  onChange: (value: ImageAdjustments) => void;
}) {
  const { t } = useTranslation("adjust");
  const dragRef = useRef<{ pointerId: number; x: number; y: number; handle: CropHandle } | null>(null);
  const adjustmentsRef = useRef(adjustments);
  useEffect(() => {
    adjustmentsRef.current = adjustments;
  }, [adjustments]);

  const applyKeyboardAdjustment = (key: string, shiftKey: boolean, handle: CropHandle) => {
    const step = shiftKey ? 5 : 1;
    const screenDelta =
      key === "ArrowLeft"
        ? { dx: -step, dy: 0 }
        : key === "ArrowRight"
          ? { dx: step, dy: 0 }
          : key === "ArrowUp"
            ? { dx: 0, dy: -step }
            : key === "ArrowDown"
              ? { dx: 0, dy: step }
              : null;
    if (!screenDelta) return false;
    const current = adjustmentsRef.current;
    const delta = screenStepToImagePercent(screenDelta.dx, screenDelta.dy, current.rotation);
    const next = { ...current, crop: updateCrop(current.crop, handle, delta.dx, delta.dy) };
    adjustmentsRef.current = next;
    onChange(next);
    return true;
  };

  useEffect(() => {
    const moveCropWithArrowKeys = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTextOrRangeInput(event.target)) return;
      if (event.target instanceof Element && event.target.closest(".crop-frame")) return;
      if (!applyKeyboardAdjustment(event.key, event.shiftKey, "move")) return;
      event.preventDefault();
    };
    window.addEventListener("keydown", moveCropWithArrowKeys);
    return () => window.removeEventListener("keydown", moveCropWithArrowKeys);
  });

  const startDrag = (event: React.PointerEvent<HTMLElement>, handle: CropHandle) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, handle };
  };

  const drag = (event: React.PointerEvent<HTMLElement>) => {
    const active = dragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const current = adjustmentsRef.current;
    const delta = screenDeltaToImagePercent(
      event.clientX - active.x,
      event.clientY - active.y,
      previewSize,
      current.rotation,
    );
    dragRef.current = { ...active, x: event.clientX, y: event.clientY };
    const next = { ...current, crop: updateCrop(current.crop, active.handle, delta.dx, delta.dy) };
    adjustmentsRef.current = next;
    onChange(next);
  };

  const stopDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const keyDown = (event: React.KeyboardEvent<HTMLElement>, handle: CropHandle) => {
    if (!applyKeyboardAdjustment(event.key, event.shiftKey, handle)) return;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      className="crop-frame"
      style={{
        inset: `${adjustments.crop.top}% ${adjustments.crop.right}% ${adjustments.crop.bottom}% ${adjustments.crop.left}%`,
      }}
    >
      <button
        className="crop-move-target"
        type="button"
        aria-label={t("cropMove")}
        style={{ cursor: handleCursor("move", adjustments.rotation) }}
        onKeyDown={(event) => keyDown(event, "move")}
        onPointerDown={(event) => startDrag(event, "move")}
        onPointerMove={drag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      />
      {cropHandles.map((handle) => (
        <button
          className={`crop-handle crop-handle-${handle}`}
          type="button"
          key={handle}
          aria-label={t("cropHandle", { direction: t(`directions.${handle}`) })}
          style={{ cursor: handleCursor(handle, adjustments.rotation) }}
          onKeyDown={(event) => keyDown(event, handle)}
          onPointerDown={(event) => startDrag(event, handle)}
          onPointerMove={drag}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
        />
      ))}
    </div>
  );
}

function isTextOrRangeInput(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
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
