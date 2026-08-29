import { Copy, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { findDuplicateIds, findInvalidTimeRangeIds } from "../domain/conflicts";
import {
  createBlankSchedule,
  scheduleTypeLabels,
  type ScheduleItem,
  type TimetableDocument,
} from "../domain/timetable";

interface ReviewStepProps {
  document: TimetableDocument;
  sourceUrl: string | null;
  onChange: (document: TimetableDocument) => void;
  onBack: () => void;
  onNext: () => void;
}

export function ReviewStep({ document, sourceUrl, onChange, onBack, onNext }: ReviewStepProps) {
  const [focusedScheduleId, setFocusedScheduleId] = useState<string | null>(null);
  const [sourceSize, setSourceSize] = useState({ width: 0, height: 0 });
  const duplicates = findDuplicateIds(document.schedules);
  const invalidTimeRanges = findInvalidTimeRangeIds(document.schedules);
  const updateEvent = <Key extends keyof TimetableDocument["event"]>(
    key: Key,
    value: TimetableDocument["event"][Key],
  ) => {
    onChange({ ...document, event: { ...document.event, [key]: value } });
  };
  const updateSchedule = (id: string, patch: Partial<ScheduleItem>) => {
    onChange({
      ...document,
      schedules: document.schedules.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    });
  };
  const duplicate = (item: ScheduleItem) =>
    onChange({
      ...document,
      schedules: [...document.schedules, { ...item, id: crypto.randomUUID(), verified: false }],
    });
  const remove = (id: string) =>
    onChange({ ...document, schedules: document.schedules.filter((item) => item.id !== id) });
  const canContinue = document.schedules.some((item) => item.artist.trim());

  return (
    <main className="workspace-shell wide">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">04 / REVIEW</span>
          <h1>読み取り結果を確認</h1>
          <p>低信頼の項目を中心に、元画像と見比べて修正してください。</p>
        </div>
        <div className="review-count">
          <strong>{document.schedules.filter((item) => item.verified).length}</strong>
          <span>/ {document.schedules.length} 確認済み</span>
        </div>
      </div>
      <section className="event-form panel">
        <h2>イベント情報</h2>
        <div className="form-grid">
          <label>
            <span>イベント名</span>
            <input
              value={document.event.name}
              onChange={(e) => updateEvent("name", e.target.value)}
              placeholder="イベント名"
            />
          </label>
          <label>
            <span>
              開催日 <b>必須</b>
            </span>
            <input
              type="date"
              value={document.event.date ?? ""}
              onChange={(e) => updateEvent("date", e.target.value || null)}
              required
            />
          </label>
          <label>
            <span>会場</span>
            <input
              value={document.event.venue ?? ""}
              onChange={(e) => updateEvent("venue", e.target.value || null)}
              placeholder="会場名"
            />
          </label>
          <label>
            <span>タイムゾーン</span>
            <select value={document.event.timezone} onChange={(e) => updateEvent("timezone", e.target.value)}>
              <option>Asia/Tokyo</option>
              <option>UTC</option>
            </select>
          </label>
          <label>
            <span>開場時刻</span>
            <input
              aria-label="開場時刻"
              type="time"
              value={document.event.openTime ?? ""}
              onChange={(e) => updateEvent("openTime", e.target.value || null)}
            />
          </label>
          <label>
            <span>開演時刻</span>
            <input
              aria-label="開演時刻"
              type="time"
              value={document.event.startTime ?? ""}
              onChange={(e) => updateEvent("startTime", e.target.value || null)}
            />
          </label>
          <label className="form-span-full">
            <span>注記</span>
            <textarea
              aria-label="注記"
              value={document.event.notes.join("\n")}
              onChange={(e) => updateEvent("notes", e.target.value.split("\n").filter(Boolean))}
              placeholder="1行につき1件"
            />
          </label>
        </div>
      </section>
      <div className={`review-layout ${sourceUrl ? "with-source" : ""}`}>
        {sourceUrl ? (
          <aside className="source-panel panel">
            <h2>
              <Search size={17} /> 元画像
            </h2>
            <div className="source-image-wrap">
              <img
                src={sourceUrl}
                alt="確認用の解析対象タイムテーブル"
                onLoad={(event) =>
                  setSourceSize({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  })
                }
              />
              {focusedScheduleId && sourceSize.width && sourceSize.height ? (
                <svg
                  className="source-region-overlay"
                  viewBox={`0 0 ${sourceSize.width} ${sourceSize.height}`}
                  aria-label="選択した予定の認識領域"
                >
                  {document.schedules
                    .find((item) => item.id === focusedScheduleId)
                    ?.sourceRegions.map((region) => (
                      <rect
                        key={`${region.x}-${region.y}-${region.width}-${region.height}`}
                        x={region.x}
                        y={region.y}
                        width={region.width}
                        height={region.height}
                      />
                    ))}
                </svg>
              ) : null}
            </div>
          </aside>
        ) : null}
        <section className="schedule-panel panel">
          <div className="panel-heading">
            <div>
              <h2>予定一覧</h2>
              <span>{document.schedules.length}件</span>
            </div>
            <button
              className="small-button"
              type="button"
              onClick={() =>
                onChange({ ...document, schedules: [...document.schedules, createBlankSchedule()] })
              }
            >
              <Plus size={15} /> 行を追加
            </button>
          </div>
          <div className="schedule-table-wrap">
            <table className="schedule-table">
              <thead>
                <tr>
                  <th>出演者名</th>
                  <th>種別</th>
                  <th>開始</th>
                  <th>終了</th>
                  <th>相対時刻</th>
                  <th>ステージ / ブース</th>
                  <th>属性</th>
                  <th>信頼度</th>
                  <th>確認</th>
                  <th>
                    <span className="sr-only">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {document.schedules.map((item) => (
                  <tr
                    key={item.id}
                    onMouseEnter={() => setFocusedScheduleId(item.id)}
                    onFocusCapture={() => setFocusedScheduleId(item.id)}
                    className={`${item.confidence === "low" ? "low-confidence" : ""} ${duplicates.has(item.id) ? "duplicate" : ""} ${invalidTimeRanges.has(item.id) ? "invalid" : ""}`}
                  >
                    <td>
                      <input
                        aria-label="出演者名"
                        value={item.artist}
                        onChange={(e) => updateSchedule(item.id, { artist: e.target.value })}
                        placeholder="出演者名"
                      />
                      {duplicates.has(item.id) ? (
                        <small className="cell-warning">重複しています</small>
                      ) : null}
                    </td>
                    <td>
                      <select
                        aria-label="種別"
                        value={item.type}
                        onChange={(e) =>
                          updateSchedule(item.id, { type: e.target.value as ScheduleItem["type"] })
                        }
                      >
                        {Object.entries(scheduleTypeLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label="開始時刻"
                        type="time"
                        value={item.startTime ?? ""}
                        onChange={(e) => updateSchedule(item.id, { startTime: e.target.value || null })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label="終了時刻"
                        type="time"
                        value={item.endTime ?? ""}
                        onChange={(e) => updateSchedule(item.id, { endTime: e.target.value || null })}
                      />
                      <label className="inline-checkbox">
                        <input
                          type="checkbox"
                          checked={item.endsNextDay}
                          onChange={(e) => updateSchedule(item.id, { endsNextDay: e.target.checked })}
                        />
                        <span>翌日</span>
                      </label>
                      {invalidTimeRanges.has(item.id) ? (
                        <small className="cell-warning">終了時刻は開始時刻より後にしてください</small>
                      ) : null}
                    </td>
                    <td>
                      <input
                        aria-label="相対時刻表現"
                        value={item.relativeTimeLabel ?? ""}
                        onChange={(e) =>
                          updateSchedule(item.id, { relativeTimeLabel: e.target.value || null })
                        }
                        placeholder="終演後など"
                      />
                    </td>
                    <td>
                      <div className="stacked-inputs">
                        <input
                          aria-label="ステージ"
                          value={item.stage ?? ""}
                          onChange={(e) => updateSchedule(item.id, { stage: e.target.value || null })}
                          placeholder="ステージ"
                        />
                        <input
                          aria-label="ブース"
                          value={item.booth ?? ""}
                          onChange={(e) => updateSchedule(item.id, { booth: e.target.value || null })}
                          placeholder="ブース"
                        />
                      </div>
                    </td>
                    <td>
                      <textarea
                        aria-label="撮影等の属性"
                        value={formatAttributes(item.attributes)}
                        onChange={(e) =>
                          updateSchedule(item.id, { attributes: parseAttributes(e.target.value) })
                        }
                        placeholder="動画=はい"
                      />
                    </td>
                    <td>
                      <span className={`confidence ${item.confidence}`}>{item.confidence}</span>
                    </td>
                    <td>
                      <label className="check-label">
                        <input
                          aria-label={`${item.artist || "予定"}を確認済みにする`}
                          type="checkbox"
                          checked={item.verified}
                          onChange={(e) => updateSchedule(item.id, { verified: e.target.checked })}
                        />
                        <span>確認済み</span>
                      </label>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          onClick={() => duplicate(item)}
                          aria-label={`${item.artist || "予定"}を複製`}
                        >
                          <Copy size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(item.id)}
                          aria-label={`${item.artist || "予定"}を削除`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="text-button align-left"
            type="button"
            onClick={() =>
              onChange({
                ...document,
                schedules: document.schedules.map((item) => ({ ...item, verified: true })),
              })
            }
          >
            すべて確認済みにする
          </button>
        </section>
      </div>
      {!document.event.date ? (
        <p className="phase-note">開催日はカレンダー出力までに入力してください。</p>
      ) : null}
      <div className="footer-actions">
        <button className="ghost-button" type="button" onClick={onBack}>
          戻る
        </button>
        <button className="primary-button" type="button" disabled={!canContinue} onClick={onNext}>
          予定を選ぶ
        </button>
      </div>
    </main>
  );
}

function formatAttributes(attributes: ScheduleItem["attributes"]): string {
  return Object.entries(attributes)
    .map(([name, value]) => `${name}=${value === null ? "未確認" : value ? "はい" : "いいえ"}`)
    .join("\n");
}

function parseAttributes(value: string): ScheduleItem["attributes"] {
  return Object.fromEntries(
    value
      .split("\n")
      .map((line) => line.split("=", 2).map((part) => part.trim()))
      .filter(([name]) => Boolean(name))
      .map(([name, state]) => [name, state === "はい" ? true : state === "いいえ" ? false : null]),
  );
}
