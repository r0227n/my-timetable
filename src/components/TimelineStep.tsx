import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { buildTimelineSvg, type TimelineOptions } from "../domain/export";
import type { ScheduleItem, TimetableDocument } from "../domain/timetable";
import { useExportLabels } from "../i18n/use-export-labels";

interface TimelineStepProps {
  document: TimetableDocument;
  schedules: ScheduleItem[];
  options: TimelineOptions;
  onChange: (options: TimelineOptions) => void;
  onBack: () => void;
  onNext: () => void;
}

const sizePresets = {
  phone: { width: 1080, height: 1920 },
  socialPortrait: { width: 1080, height: 1350 },
  socialLandscape: { width: 1600, height: 900 },
  a4: { width: 1240, height: 1754 },
} as const;

export function TimelineStep({ document, schedules, options, onChange, onBack, onNext }: TimelineStepProps) {
  const { t } = useTranslation("timeline");
  const labels = useExportLabels();
  const svg = useMemo(
    () => buildTimelineSvg(document, schedules, options, labels),
    [document, labels, options, schedules],
  );
  const previewUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  return (
    <main className="workspace-shell timeline-shell">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">06 / TIMELINE</span>
          <h1>{t("heading")}</h1>
          <p>{t("description")}</p>
        </div>
      </div>
      <div className="timeline-layout">
        <section className="timeline-preview panel" aria-label={t("previewLabel")}>
          <img src={previewUrl} alt={t("previewAlt")} />
        </section>
        <aside className="timeline-controls panel">
          <label>
            <span>{t("title")}</span>
            <input
              value={options.title}
              placeholder={document.event.name || labels.defaultTitle}
              onChange={(event) => onChange({ ...options, title: event.target.value })}
            />
          </label>
          <label>
            <span>{t("layout")}</span>
            <select
              value={options.layout}
              onChange={(event) =>
                onChange({ ...options, layout: event.target.value as TimelineOptions["layout"] })
              }
            >
              <option value="vertical">{t("vertical")}</option>
              <option value="horizontal">{t("horizontal")}</option>
            </select>
          </label>
          <label>
            <span>{t("outputSize")}</span>
            <select
              value={presetValue(options)}
              onChange={(event) => {
                const preset = sizePresets[event.target.value as keyof typeof sizePresets];
                if (preset) onChange({ ...options, width: preset.width, height: preset.height });
              }}
            >
              {Object.entries(sizePresets).map(([value]) => (
                <option value={value} key={value}>
                  {t(`presets.${value as keyof typeof sizePresets}`)}
                </option>
              ))}
              <option value="custom">{t("presets.custom")}</option>
            </select>
          </label>
          <div className="size-inputs">
            <label>
              <span>{t("width")}</span>
              <input
                type="number"
                min={320}
                value={options.width}
                onChange={(event) => onChange({ ...options, width: Number(event.target.value) })}
              />
            </label>
            <label>
              <span>{t("height")}</span>
              <input
                type="number"
                min={320}
                value={options.height}
                onChange={(event) => onChange({ ...options, height: Number(event.target.value) })}
              />
            </label>
          </div>
          <div className="size-inputs">
            <label>
              <span>{t("background")}</span>
              <input
                type="color"
                value={options.background}
                onChange={(event) => onChange({ ...options, background: event.target.value })}
              />
            </label>
            <label>
              <span>{t("accent")}</span>
              <input
                type="color"
                value={options.accent}
                onChange={(event) => onChange({ ...options, accent: event.target.value })}
              />
            </label>
          </div>
          <fieldset className="display-options">
            <legend>{t("displayItems")}</legend>
            {(
              [
                ["showDate", "showDate"],
                ["showVenue", "showVenue"],
                ["showType", "showType"],
                ["showStage", "showStage"],
                ["showBooth", "showBooth"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={options[key]}
                  onChange={(event) => onChange({ ...options, [key]: event.target.checked })}
                />
                <span>{t(label)}</span>
              </label>
            ))}
          </fieldset>
        </aside>
      </div>
      <div className="footer-actions">
        <button className="ghost-button" type="button" onClick={onBack}>
          {t("back")}
        </button>
        <button className="primary-button" type="button" onClick={onNext}>
          {t("next")}
        </button>
      </div>
    </main>
  );
}

function presetValue(options: TimelineOptions): string {
  return (
    Object.entries(sizePresets).find(
      ([, preset]) => preset.width === options.width && preset.height === options.height,
    )?.[0] ?? "custom"
  );
}
