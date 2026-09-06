import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Eye, Maximize2, Palette, Users, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { groupArtistSchedules, timelineTimeLabel } from "../domain/artist-timeline";
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
const palettes = {
  forest: { background: "#f5faf7", accent: "#187864" },
  sunset: { background: "#fff8f0", accent: "#df5d3d" },
  ocean: { background: "#f4f8ff", accent: "#3567ba" },
  lilac: { background: "#faf5ff", accent: "#8954b5" },
} as const;
const tools = [
  { key: "artists", icon: Users },
  { key: "design", icon: Palette },
  { key: "content", icon: Eye },
  { key: "size", icon: Maximize2 },
] as const;

export function TimelineStep({ document, schedules, options, onChange, onBack, onNext }: TimelineStepProps) {
  const { t } = useTranslation("timeline");
  const labels = useExportLabels();
  const [zoomed, setZoomed] = useState(false);
  const rows = useMemo(() => groupArtistSchedules(document, schedules), [document, schedules]);
  const [tool, setTool] = useState<(typeof tools)[number]["key"]>("artists");
  const svg = useMemo(
    () => buildTimelineSvg(document, schedules, options, labels),
    [document, labels, options, schedules],
  );
  const previewUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const selectedPreset = Object.entries(sizePresets).find(
    ([, preset]) => preset.width === options.width && preset.height === options.height,
  )?.[0];

  /* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- The zoomed preview is a scroll region and needs keyboard focus for panning. */
  return (
    <main className="timeline-studio">
      <header className="studio-heading">
        <div>
          <span className="eyebrow">06 / TIMELINE STUDIO</span>
          <h1>{t("heading")}</h1>
        </div>
        <p>{t("description")}</p>
      </header>
      <div className="studio-layout">
        <section className="studio-preview" aria-label={t("previewLabel")}>
          <div className="studio-preview-bar">
            <span>
              <Eye size={16} aria-hidden="true" />
              {t("previewLabel")}
            </span>
            <span>
              {options.width} × {options.height} px
            </span>
          </div>
          <section
            className={`studio-artboard ${zoomed ? "zoomed" : ""}`}
            aria-label={t("previewAlt")}
            tabIndex={zoomed ? 0 : undefined}
          >
            <img src={previewUrl} alt={t("previewAlt")} />
          </section>
          <div className="studio-preview-tools">
            <span>{t("artistCount", { count: rows.length })}</span>
            <button
              type="button"
              className="ghost-button"
              aria-pressed={zoomed}
              onClick={() => setZoomed(!zoomed)}
            >
              {zoomed ? <ZoomOut size={16} aria-hidden="true" /> : <ZoomIn size={16} aria-hidden="true" />}
              {zoomed ? t("fitPreview") : t("zoomPreview")}
            </button>
          </div>
          <p className="studio-preview-note">
            <Check size={14} aria-hidden="true" />
            {t("livePreview")}
          </p>
        </section>
        <aside className="studio-inspector" aria-label={t("editingTools")}>
          <div className="studio-tool-switcher">
            {tools.map(({ key, icon: Icon }) => (
              <button
                key={key}
                type="button"
                aria-pressed={tool === key}
                aria-controls="studio-tool-panel"
                onClick={() => setTool(key)}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{t(`tools.${key}`)}</span>
              </button>
            ))}
          </div>
          <section id="studio-tool-panel" className="studio-tool-panel" aria-label={t(`tools.${tool}`)}>
            {tool === "artists" && (
              <>
                <div className="artist-editor-intro">
                  <h2>{t("groupHeading")}</h2>
                  <p>{t("groupDescription")}</p>
                </div>
                <div className="artist-editor-rows">
                  {rows.map((row) => (
                    <article className="artist-editor-row" key={row.id}>
                      <header>
                        <h3>{row.artist}</h3>
                        {row.date && <span>{row.date}</span>}
                      </header>
                      <div className="artist-editor-times">
                        {(
                          [
                            { key: "live", label: labels.scheduleTypes.live },
                            { key: "commerce", label: labels.commerce },
                          ] as const
                        ).map(({ key, label }) => (
                          <section key={key} aria-label={`${row.artist} ${label}`}>
                            <h4>{label}</h4>
                            {row[key].length ? (
                              row[key].map((item) => (
                                <p key={item.id}>
                                  <strong>{timelineTimeLabel(item, labels.unsetTime, labels.nextDay)}</strong>
                                  <span>
                                    {[labels.scheduleTypes[item.type], item.stage, item.booth]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </span>
                                </p>
                              ))
                            ) : (
                              <p>—</p>
                            )}
                          </section>
                        ))}
                      </div>
                      {row.other.length > 0 && (
                        <div className="artist-editor-other">
                          {row.other.map((item) => (
                            <p key={item.id}>
                              {labels.scheduleTypes.other} ·{" "}
                              {timelineTimeLabel(item, labels.unsetTime, labels.nextDay)}
                            </p>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
                <p className="studio-field-hint">{t("selectionHint")}</p>
              </>
            )}
            {tool === "design" && (
              <>
                <fieldset className="studio-fieldset">
                  <legend>{t("colorTheme")}</legend>
                  <div className="studio-palettes">
                    {Object.entries(palettes).map(([key, palette]) => (
                      <button
                        type="button"
                        key={key}
                        aria-label={t(`palettes.${key as keyof typeof palettes}`)}
                        aria-pressed={
                          options.background === palette.background && options.accent === palette.accent
                        }
                        onClick={() => onChange({ ...options, ...palette })}
                      >
                        <span
                          className="studio-palette-sample"
                          style={{ background: palette.background, borderLeftColor: palette.accent }}
                          aria-hidden="true"
                        >
                          <span style={{ background: palette.accent }} />
                        </span>
                        <span>{t(`palettes.${key as keyof typeof palettes}`)}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
                <div className="studio-color-fields">
                  {(["background", "accent"] as const).map((key) => (
                    <label key={key}>
                      <span>{t(key)}</span>
                      <span className="studio-color-input">
                        <input
                          type="color"
                          value={options[key]}
                          onChange={(event) => onChange({ ...options, [key]: event.target.value })}
                        />
                        <span aria-hidden="true">{options[key].toUpperCase()}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </>
            )}
            {tool === "content" && (
              <>
                <label className="studio-field">
                  <span>{t("title")}</span>
                  <input
                    value={options.title}
                    placeholder={document.event.name || labels.defaultTitle}
                    onChange={(event) => onChange({ ...options, title: event.target.value })}
                  />
                </label>
                <fieldset className="studio-fieldset studio-display-options">
                  <legend>{t("displayItems")}</legend>
                  {(["showDate", "showVenue", "showType", "showStage", "showBooth"] as const).map((key) => (
                    <label key={key}>
                      <span>{t(key)}</span>
                      <input
                        type="checkbox"
                        checked={options[key]}
                        onChange={(event) => onChange({ ...options, [key]: event.target.checked })}
                      />
                    </label>
                  ))}
                </fieldset>
              </>
            )}
            {tool === "size" && (
              <>
                <fieldset className="studio-fieldset">
                  <legend>{t("outputSize")}</legend>
                  <div className="studio-size-presets">
                    {Object.entries(sizePresets).map(([key, preset]) => (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={selectedPreset === key}
                        onClick={() => onChange({ ...options, ...preset })}
                      >
                        <span
                          className="studio-size-shape"
                          style={{ aspectRatio: `${preset.width} / ${preset.height}` }}
                          aria-hidden="true"
                        />
                        <span>
                          <strong>{t(`presets.${key as keyof typeof sizePresets}`)}</strong>
                          <small>
                            {preset.width} × {preset.height}
                          </small>
                        </span>
                        {selectedPreset === key && <Check size={16} aria-hidden="true" />}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="studio-fieldset">
                  <legend>{t("presets.custom")}</legend>
                  <div className="studio-size-fields">
                    {(["width", "height"] as const).map((key) => (
                      <label className="studio-field" key={key}>
                        <span>{t(key)} (px)</span>
                        <DimensionInput
                          value={options[key]}
                          onChange={(value) => onChange({ ...options, [key]: value })}
                        />
                      </label>
                    ))}
                  </div>
                  <p className="studio-field-hint">{t("sizeHint")}</p>
                </fieldset>
              </>
            )}
          </section>
        </aside>
      </div>
      <footer className="studio-actions">
        <button className="ghost-button" type="button" onClick={onBack}>
          <ArrowLeft size={17} aria-hidden="true" />
          {t("back")}
        </button>
        <button className="primary-button" type="button" onClick={onNext}>
          {t("next")}
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      </footer>
    </main>
  );
}

/* oxlint-enable jsx-a11y/no-noninteractive-tabindex */

function DimensionInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const [previousValue, setPreviousValue] = useState(value);
  if (previousValue !== value) {
    setPreviousValue(value);
    setDraft(String(value));
  }
  return (
    <input
      type="number"
      min={320}
      step={1}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        const next = event.target.valueAsNumber;
        if (Number.isInteger(next) && next >= 320) onChange(next);
      }}
      onBlur={() => {
        const parsed = Number(draft);
        const next = draft.trim() && Number.isFinite(parsed) ? Math.max(320, Math.round(parsed)) : value;
        setDraft(String(next));
        onChange(next);
      }}
    />
  );
}
