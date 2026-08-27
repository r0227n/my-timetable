import { useMemo } from "react";
import { buildTimelineSvg, type TimelineOptions } from "../domain/export";
import type { ScheduleItem, TimetableDocument } from "../domain/timetable";

interface TimelineStepProps {
  document: TimetableDocument;
  schedules: ScheduleItem[];
  options: TimelineOptions;
  onChange: (options: TimelineOptions) => void;
  onBack: () => void;
  onNext: () => void;
}

const sizePresets = {
  phone: { label: "スマートフォン縦長", width: 1080, height: 1920 },
  socialPortrait: { label: "SNS縦長", width: 1080, height: 1350 },
  socialLandscape: { label: "SNS横長", width: 1600, height: 900 },
  a4: { label: "A4縦", width: 1240, height: 1754 },
} as const;

export function TimelineStep({ document, schedules, options, onChange, onBack, onNext }: TimelineStepProps) {
  const svg = useMemo(() => buildTimelineSvg(document, schedules, options), [document, options, schedules]);
  const previewUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  return (
    <main className="workspace-shell timeline-shell">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">06 / TIMELINE</span>
          <h1>タイムラインを整える</h1>
          <p>選んだ予定だけを使って、保存用のレイアウトを調整します。</p>
        </div>
      </div>
      <div className="timeline-layout">
        <section className="timeline-preview panel" aria-label="タイムラインプレビュー">
          <img src={previewUrl} alt="生成したタイムラインのプレビュー" />
        </section>
        <aside className="timeline-controls panel">
          <label>
            <span>タイトル</span>
            <input
              value={options.title}
              placeholder={document.event.name || "My Timetable"}
              onChange={(event) => onChange({ ...options, title: event.target.value })}
            />
          </label>
          <label>
            <span>レイアウト</span>
            <select
              value={options.layout}
              onChange={(event) =>
                onChange({ ...options, layout: event.target.value as TimelineOptions["layout"] })
              }
            >
              <option value="vertical">縦型</option>
              <option value="horizontal">横型</option>
            </select>
          </label>
          <label>
            <span>出力サイズ</span>
            <select
              value={presetValue(options)}
              onChange={(event) => {
                const preset = sizePresets[event.target.value as keyof typeof sizePresets];
                if (preset) onChange({ ...options, width: preset.width, height: preset.height });
              }}
            >
              {Object.entries(sizePresets).map(([value, preset]) => (
                <option value={value} key={value}>
                  {preset.label}
                </option>
              ))}
              <option value="custom">カスタム</option>
            </select>
          </label>
          <div className="size-inputs">
            <label>
              <span>幅</span>
              <input
                type="number"
                min={320}
                value={options.width}
                onChange={(event) => onChange({ ...options, width: Number(event.target.value) })}
              />
            </label>
            <label>
              <span>高さ</span>
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
              <span>背景色</span>
              <input
                type="color"
                value={options.background}
                onChange={(event) => onChange({ ...options, background: event.target.value })}
              />
            </label>
            <label>
              <span>アクセント色</span>
              <input
                type="color"
                value={options.accent}
                onChange={(event) => onChange({ ...options, accent: event.target.value })}
              />
            </label>
          </div>
          <fieldset className="display-options">
            <legend>表示項目</legend>
            {(
              [
                ["showDate", "日付"],
                ["showVenue", "会場"],
                ["showType", "種別"],
                ["showStage", "ステージ"],
                ["showBooth", "ブース"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={options[key]}
                  onChange={(event) => onChange({ ...options, [key]: event.target.checked })}
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
        </aside>
      </div>
      <div className="footer-actions">
        <button className="ghost-button" type="button" onClick={onBack}>
          選択へ戻る
        </button>
        <button className="primary-button" type="button" onClick={onNext}>
          出力へ進む
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
