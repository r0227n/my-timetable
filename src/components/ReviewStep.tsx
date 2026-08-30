import { Copy, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { findDuplicateIds, findInvalidTimeRangeIds } from "../domain/conflicts";
import {
  createBlankSchedule,
  resolveScheduleDate,
  scheduleTypes,
  type ScheduleItem,
  type TimetableDocument,
} from "../domain/timetable";
import { formatNumber } from "../i18n/format";
import { currentLanguage } from "../i18n/i18n";

interface ReviewStepProps {
  document: TimetableDocument;
  sourceUrl: string | null;
  onChange: (document: TimetableDocument) => void;
  onBack: () => void;
  onNext: () => void;
}

export function ReviewStep({ document, sourceUrl, onChange, onBack, onNext }: ReviewStepProps) {
  const { t } = useTranslation("review");
  const { t: tCommon } = useTranslation("common");
  const language = currentLanguage();
  const [focusedScheduleId, setFocusedScheduleId] = useState<string | null>(null);
  const [sourceSize, setSourceSize] = useState({ width: 0, height: 0 });
  const duplicates = findDuplicateIds(document.schedules, document.event.date);
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
          <h1>{t("heading")}</h1>
          <p>{t("description")}</p>
        </div>
        <div className="review-count">
          <strong>
            {t("verifiedCount", {
              verified: formatNumber(document.schedules.filter((item) => item.verified).length, language),
              total: formatNumber(document.schedules.length, language),
            })}
          </strong>
        </div>
      </div>
      <section className="event-form panel">
        <h2>{t("eventInfo")}</h2>
        <div className="form-grid">
          <label>
            <span>{t("eventName")}</span>
            <input
              value={document.event.name}
              onChange={(e) => updateEvent("name", e.target.value)}
              placeholder={t("eventName")}
            />
          </label>
          <label>
            <span>{t("date")}</span>
            <input
              type="date"
              value={document.event.date ?? ""}
              onChange={(e) => updateEvent("date", e.target.value || null)}
            />
          </label>
          <label>
            <span>{t("venue")}</span>
            <input
              value={document.event.venue ?? ""}
              onChange={(e) => updateEvent("venue", e.target.value || null)}
              placeholder={t("venuePlaceholder")}
            />
          </label>
          <label>
            <span>{t("timezone")}</span>
            <select value={document.event.timezone} onChange={(e) => updateEvent("timezone", e.target.value)}>
              <option>Asia/Tokyo</option>
              <option>UTC</option>
            </select>
          </label>
          <label>
            <span>{t("openTime")}</span>
            <input
              aria-label={t("openTime")}
              type="time"
              value={document.event.openTime ?? ""}
              onChange={(e) => updateEvent("openTime", e.target.value || null)}
            />
          </label>
          <label>
            <span>{t("startTime")}</span>
            <input
              aria-label={t("startTime")}
              type="time"
              value={document.event.startTime ?? ""}
              onChange={(e) => updateEvent("startTime", e.target.value || null)}
            />
          </label>
          <label className="form-span-full">
            <span>{t("notes")}</span>
            <textarea
              aria-label={t("notes")}
              value={document.event.notes.join("\n")}
              onChange={(e) => updateEvent("notes", e.target.value.split("\n").filter(Boolean))}
              placeholder={t("notesPlaceholder")}
            />
          </label>
        </div>
      </section>
      <div className={`review-layout ${sourceUrl ? "with-source" : ""}`}>
        {sourceUrl ? (
          <aside className="source-panel panel">
            <h2>
              <Search size={17} /> {t("sourceImage")}
            </h2>
            <div className="source-image-wrap">
              <img
                src={sourceUrl}
                alt={t("sourceAlt")}
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
                  aria-label={t("sourceRegion")}
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
              <h2>{t("scheduleList")}</h2>
              <span>
                {t("scheduleCount", {
                  count: document.schedules.length,
                  formattedCount: formatNumber(document.schedules.length, language),
                })}
              </span>
            </div>
            <button
              className="small-button"
              type="button"
              onClick={() =>
                onChange({ ...document, schedules: [...document.schedules, createBlankSchedule()] })
              }
            >
              <Plus size={15} /> {t("addRow")}
            </button>
          </div>
          <div className="schedule-table-wrap">
            <table className="schedule-table">
              <thead>
                <tr>
                  <th>{t("columns.artist")}</th>
                  <th>{t("columns.type")}</th>
                  <th>{t("columns.date")}</th>
                  <th>{t("columns.start")}</th>
                  <th>{t("columns.end")}</th>
                  <th>{t("columns.relative")}</th>
                  <th>{t("columns.place")}</th>
                  <th>{t("columns.attributes")}</th>
                  <th>{t("columns.confidence")}</th>
                  <th>{t("columns.verified")}</th>
                  <th>
                    <span className="sr-only">{t("columns.actions")}</span>
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
                        aria-label={t("artist")}
                        value={item.artist}
                        onChange={(e) => updateSchedule(item.id, { artist: e.target.value })}
                        placeholder={t("artist")}
                      />
                      {duplicates.has(item.id) ? (
                        <small className="cell-warning">{t("duplicateWarning")}</small>
                      ) : null}
                    </td>
                    <td>
                      <input
                        aria-label={t("scheduleDate")}
                        type="date"
                        value={item.date ?? ""}
                        onChange={(e) => updateSchedule(item.id, { date: e.target.value || null })}
                      />
                    </td>
                    <td>
                      <select
                        aria-label={t("type")}
                        value={item.type}
                        onChange={(e) =>
                          updateSchedule(item.id, { type: e.target.value as ScheduleItem["type"] })
                        }
                      >
                        {scheduleTypes.map((value) => (
                          <option key={value} value={value}>
                            {tCommon(`scheduleTypes.${value}`)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label={t("scheduleStart")}
                        type="time"
                        value={item.startTime ?? ""}
                        onChange={(e) => updateSchedule(item.id, { startTime: e.target.value || null })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={t("scheduleEnd")}
                        type="time"
                        value={item.endTime ?? ""}
                        onChange={(e) =>
                          updateSchedule(item.id, {
                            endTime: e.target.value || null,
                            endTimeSource: e.target.value ? "manual" : "missing",
                            verified: false,
                          })
                        }
                      />
                      {item.endTimeSource.startsWith("inferred") ? (
                        <small className="cell-warning">
                          {item.endTimeSource === "inferred_next_start"
                            ? t("endTimeSources.inferred_next_start")
                            : t("endTimeSources.inferred_default")}
                        </small>
                      ) : null}
                      <label className="inline-checkbox">
                        <input
                          type="checkbox"
                          checked={item.endsNextDay}
                          onChange={(e) => updateSchedule(item.id, { endsNextDay: e.target.checked })}
                        />
                        <span>翌日</span>
                      </label>
                      {invalidTimeRanges.has(item.id) ? (
                        <small className="cell-warning">{t("invalidRange")}</small>
                      ) : null}
                    </td>
                    <td>
                      <input
                        aria-label={t("relativeTime")}
                        value={item.relativeTimeLabel ?? ""}
                        onChange={(e) =>
                          updateSchedule(item.id, { relativeTimeLabel: e.target.value || null })
                        }
                        placeholder={t("relativePlaceholder")}
                      />
                    </td>
                    <td>
                      <div className="stacked-inputs">
                        <input
                          aria-label={t("stage")}
                          value={item.stage ?? ""}
                          onChange={(e) => updateSchedule(item.id, { stage: e.target.value || null })}
                          placeholder={t("stage")}
                        />
                        <input
                          aria-label={t("booth")}
                          value={item.booth ?? ""}
                          onChange={(e) => updateSchedule(item.id, { booth: e.target.value || null })}
                          placeholder={t("booth")}
                        />
                      </div>
                    </td>
                    <td>
                      <textarea
                        aria-label={t("attributes")}
                        value={formatAttributes(item.attributes, {
                          unknown: tCommon("attribute.unknown"),
                          yes: tCommon("attribute.yes"),
                          no: tCommon("attribute.no"),
                        })}
                        onChange={(e) =>
                          updateSchedule(item.id, {
                            attributes: parseAttributes(e.target.value, {
                              yes: tCommon("attribute.yes"),
                              no: tCommon("attribute.no"),
                            }),
                          })
                        }
                        placeholder={t("attributesPlaceholder")}
                      />
                    </td>
                    <td>
                      <span className={`confidence ${item.confidence}`}>{item.confidence}</span>
                    </td>
                    <td>
                      <label className="check-label">
                        <input
                          aria-label={t("markVerified", { artist: item.artist || t("scheduleFallback") })}
                          type="checkbox"
                          checked={item.verified}
                          onChange={(e) => updateSchedule(item.id, { verified: e.target.checked })}
                        />
                        <span>{t("verified")}</span>
                      </label>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          onClick={() => duplicate(item)}
                          aria-label={t("duplicate", { artist: item.artist || t("scheduleFallback") })}
                        >
                          <Copy size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(item.id)}
                          aria-label={t("delete", { artist: item.artist || t("scheduleFallback") })}
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
                schedules: document.schedules.map((item) => ({
                  ...item,
                  verified: item.endTimeSource.startsWith("inferred") ? item.verified : true,
                })),
              })
            }
          >
            {t("verifyAll")}
          </button>
        </section>
      </div>
      {document.schedules.some((item) => !resolveScheduleDate(document, item)) ? (
        <p className="phase-note">{t("dateReminder")}</p>
      ) : null}
      <div className="footer-actions">
        <button className="ghost-button" type="button" onClick={onBack}>
          {tCommon("back")}
        </button>
        <button className="primary-button" type="button" disabled={!canContinue} onClick={onNext}>
          {t("next")}
        </button>
      </div>
    </main>
  );
}

function formatAttributes(
  attributes: ScheduleItem["attributes"],
  labels: { unknown: string; yes: string; no: string },
): string {
  return Object.entries(attributes)
    .map(([name, value]) => `${name}=${value === null ? labels.unknown : value ? labels.yes : labels.no}`)
    .join("\n");
}

function parseAttributes(value: string, labels: { yes: string; no: string }): ScheduleItem["attributes"] {
  return Object.fromEntries(
    value
      .split("\n")
      .map((line) => line.split("=", 2).map((part) => part.trim()))
      .filter(([name]) => Boolean(name))
      .map(([name, state]) => [name, state === labels.yes ? true : state === labels.no ? false : null]),
  );
}
