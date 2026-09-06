import { ArrowLeft, ArrowRight, Check, CheckCheck, Copy, Plus, Search, Trash2 } from "lucide-react";
import type { TFunction } from "i18next";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { groupArtistSchedules, timelineTimeLabel } from "../domain/artist-timeline";
import { findDuplicateIds, findInvalidTimeRangeIds } from "../domain/conflicts";
import {
  canVerifySchedule,
  matchesReviewFilter,
  selectableSchedules,
  type ReviewFilter,
} from "../domain/schedule-review";
import {
  createBlankSchedule,
  scheduleTypes,
  type ScheduleItem,
  type TimetableDocument,
} from "../domain/timetable";
import { formatNumber } from "../i18n/format";
import { currentLanguage } from "../i18n/i18n";
import type { OcrResult, OcrTextRegion } from "@my-timetable/glm-ocr-web";

interface ReviewStepProps {
  document: TimetableDocument;
  sourceUrl: string | null;
  ocrResult: OcrResult | null;
  onChange: (document: TimetableDocument) => void;
  onBack: () => void;
  onNext: () => void;
}
type MobilePanel = "details" | "source";

export function ReviewStep({ document, sourceUrl, ocrResult, onChange, onBack, onNext }: ReviewStepProps) {
  const { t } = useTranslation("review");
  const { t: tc } = useTranslation("common");
  const language = currentLanguage();
  const [filter, setFilter] = useState<ReviewFilter>("needs_review");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("details");
  const [sourceSize, setSourceSize] = useState({ width: 0, height: 0 });
  const duplicates = findDuplicateIds(document.schedules, document.event.date);
  const invalidRanges = findInvalidTimeRangeIds(document.schedules);
  const reviewRows = useMemo(
    () =>
      groupArtistSchedules(document, document.schedules).filter((row) =>
        [...row.live, ...row.commerce, ...row.other].some((item) =>
          matchesReviewFilter(document, item, filter),
        ),
      ),
    [document, filter],
  );
  const filtered = reviewRows.flatMap((row) => [...row.live, ...row.commerce, ...row.other]);
  const effectiveSelectedId = filtered.some((item) => item.id === selectedId)
    ? selectedId
    : (filtered.find(item => matchesReviewFilter(document, item, filter))?.id ?? null);
  const selected = document.schedules.find((item) => item.id === effectiveSelectedId) ?? null;
  const selectedOcrRegions = selected
    ? (ocrResult?.regions.filter((region) =>
        selected.sourceRegions.some((sourceRegion) => regionsOverlap(region.region, sourceRegion)),
      ) ?? [])
    : [];
  const eligible = document.schedules.filter((item) => !item.verified && canVerifySchedule(document, item));
  const selectable = selectableSchedules(document);
  const excludedCount = document.schedules.length - selectable.length;

  const updateEvent = <K extends keyof TimetableDocument["event"]>(
    key: K,
    value: TimetableDocument["event"][K],
  ) =>
    onChange({
      ...document,
      event: { ...document.event, [key]: value },
      schedules:
        key === "date" && value !== document.event.date
          ? document.schedules.map((item) => (item.date === null ? { ...item, verified: false } : item))
          : document.schedules,
    });
  const updateSchedule = (id: string, patch: Partial<ScheduleItem>) =>
    onChange({
      ...document,
      schedules: document.schedules.map((item) =>
        item.id === id ? { ...item, ...patch, verified: patch.verified ?? false } : item,
      ),
    });
  const duplicate = (item: ScheduleItem) => {
    const copy = { ...item, id: crypto.randomUUID(), verified: false };
    onChange({ ...document, schedules: [...document.schedules, copy] });
    setFilter("needs_review");
    setMobilePanel("details");
    setSelectedId(copy.id);
  };
  const remove = (id: string) => {
    onChange({ ...document, schedules: document.schedules.filter((item) => item.id !== id) });
    setSelectedId(document.schedules.find((item) => item.id !== id)?.id ?? null);
  };
  const add = () => {
    const item = createBlankSchedule();
    onChange({ ...document, schedules: [...document.schedules, item] });
    setFilter("needs_review");
    setMobilePanel("details");
    setSelectedId(item.id);
  };

  const confirmAndNext = () => {
    if (!selected || !canVerifySchedule(document, selected)) return;
    const remaining = filtered.filter((item) => item.id !== selected.id && !item.verified);
    updateSchedule(selected.id, { verified: true });
    setSelectedId(remaining[0]?.id ?? selected.id);
  };

  return (
    <main className="review-desk">
      <div className="review-desk-heading">
        <div>
          <span className="eyebrow">04 / REVIEW</span>
          <h1>{t("heading")}</h1>
          <p>{t("description")}</p>
        </div>
        <div className="review-count">
          <strong>{formatNumber(selectable.length, language)}</strong>
          <span>{t("readyCount", { total: formatNumber(document.schedules.length, language) })}</span>
        </div>
      </div>
      <section className="review-event">
        <h2>{t("eventInfo")}</h2>
        <div className="review-event-primary">
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
              aria-label={t("date")}
              type="date"
              value={document.event.date ?? ""}
              onChange={(e) => updateEvent("date", e.target.value || null)}
            />
          </label>
        </div>
        {!document.event.date && <p className="review-date-reminder">{t("dateReminder")}</p>}
        <details className="review-event-more">
          <summary>{t("eventMore")}</summary>
          <div className="form-grid">
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
              <select
                value={document.event.timezone}
                onChange={(e) => updateEvent("timezone", e.target.value)}
              >
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
        </details>
      </section>
      {sourceUrl && (
        <div className="review-panel-switch">
          <button
            type="button"
            aria-pressed={mobilePanel === "details"}
            onClick={() => setMobilePanel("details")}
          >
            {t("details")}
          </button>
          {sourceUrl ? (
            <button
              type="button"
              aria-pressed={mobilePanel === "source"}
              onClick={() => setMobilePanel("source")}
            >
              {t("sourceImage")}
            </button>
          ) : null}
        </div>
      )}
      <div className={`review-workspace ${sourceUrl ? "has-source" : ""}`}>
        {sourceUrl ? (
          <aside className={`review-source source-panel mobile-${mobilePanel}`}>
            <h2>
              <Search size={17} /> {t("sourceImage")}
            </h2>
            <div className="source-image-wrap">
              <img
                src={sourceUrl}
                alt={t("sourceAlt")}
                onLoad={(e) =>
                  setSourceSize({
                    width: e.currentTarget.naturalWidth,
                    height: e.currentTarget.naturalHeight,
                  })
                }
              />
              {selected && sourceSize.width && sourceSize.height ? (
                <svg
                  className="source-region-overlay"
                  viewBox={`0 0 ${sourceSize.width} ${sourceSize.height}`}
                  aria-label={t("sourceRegion")}
                >
                  {selected.sourceRegions.map((r) => (
                    <rect key={`${r.x}-${r.y}-${r.width}-${r.height}`} {...r} />
                  ))}
                </svg>
              ) : null}
            </div>
            {selectedOcrRegions.length ? (
              <section className="ocr-evidence" aria-label={t("ocrEvidence")}>
                <h3>{t("ocrEvidence")}</h3>
                {selectedOcrRegions.map((region) => (
                  <OcrEvidence key={region.id} region={region} t={t} />
                ))}
              </section>
            ) : null}
          </aside>
        ) : null}
        <section className="review-queue" aria-label={t("scheduleList")}>
          <div className="panel-heading">
            <div>
              <h2>{t("scheduleList")}</h2>
              <span>
                {t("scheduleCount", {
                  count: filtered.length,
                  formattedCount: formatNumber(filtered.length, language),
                })}
              </span>
            </div>
            <button className="small-button" type="button" onClick={add}>
              <Plus size={15} /> {t("addRow")}
            </button>
          </div>
          <fieldset className="review-filters" aria-label={t("filterLabel")}>
            {(["all", "needs_review", "verified"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {t(`filters.${value}`)}
              </button>
            ))}
          </fieldset>
          <div className="review-queue-items">
            {reviewRows.map((row) => (
              <article className="review-artist-card" key={row.id}>
                <header>
                  <strong className="schedule-select">{row.artist || t("scheduleFallback")}</strong>
                  <span>{row.date ?? tc("unset")}</span>
                </header>
                <div className="review-artist-times">
                  {(
                    [
                      { key: "live", label: tc("scheduleTypes.live") },
                      { key: "commerce", label: t("commerce") },
                    ] as const
                  ).map(({ key, label }) => (
                    <section key={key} aria-label={`${row.artist} ${label}`}>
                      <h3>{label}</h3>
                      {row[key].length ? (
                        row[key].map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className="review-queue-item"
                            aria-label={`${row.artist} ${tc(`scheduleTypes.${item.type}`)} ${timelineTimeLabel(item, tc("unset"), t("nextDayShort"))}`}
                            aria-pressed={effectiveSelectedId === item.id}
                            onClick={() => {
                              setSelectedId(item.id);
                              setMobilePanel("details");
                            }}
                          >
                            <strong className="review-queue-time">
                              {timelineTimeLabel(item, tc("unset"), t("nextDayShort"))}
                            </strong>
                            <span className="review-queue-meta">
                              {[item.stage, item.booth].filter(Boolean).join(" / ") ||
                                tc(`scheduleTypes.${item.type}`)}
                            </span>
                            <span className="review-queue-top">
                              {item.verified && canVerifySchedule(document, item) ? (
                                <>
                                  <Check size={13} aria-hidden="true" />
                                  {t("verified")}
                                </>
                              ) : (
                                t("unverified")
                              )}
                              <span className={`confidence ${item.confidence}`}>
                                {tc(`confidence.${item.confidence}`)}
                              </span>
                            </span>
                          </button>
                        ))
                      ) : (
                        <p className="review-no-time">—</p>
                      )}
                    </section>
                  ))}
                </div>
                {row.other.map((item) => (
                  <button
                    key={item.id}
                    className="review-queue-item"
                    type="button"
                    aria-pressed={effectiveSelectedId === item.id}
                    onClick={() => {
                      setSelectedId(item.id);
                      setMobilePanel("details");
                    }}
                  >
                    {tc("scheduleTypes.other")} · {timelineTimeLabel(item, tc("unset"), t("nextDayShort"))}
                  </button>
                ))}
              </article>
            ))}
            {!filtered.length && <p className="empty-review">{t("emptyFilter")}</p>}
          </div>
          <button
            className="text-button align-left"
            type="button"
            disabled={!eligible.length}
            onClick={() =>
              onChange({
                ...document,
                schedules: document.schedules.map((item) =>
                  eligible.some((e) => e.id === item.id) ? { ...item, verified: true } : item,
                ),
              })
            }
          >
            {t("verifyEligible", {
              count: eligible.length,
              formattedCount: formatNumber(eligible.length, language),
            })}
          </button>
        </section>
        <aside className={`review-detail schedule-detail mobile-${mobilePanel}`}>
          <div className="review-detail-heading">
            <span className="eyebrow">{t("currentItem")}</span>
            <h2>{selected?.artist || t("details")}</h2>
          </div>
          {selected ? (
            <ScheduleDetails
              item={selected}
              document={document}
              duplicates={duplicates}
              invalidRanges={invalidRanges}
              update={updateSchedule}
              duplicate={duplicate}
              remove={remove}
              t={t}
              tc={tc}
              confirmAndNext={confirmAndNext}
            />
          ) : (
            <p className="muted">{t("selectPrompt")}</p>
          )}
        </aside>
      </div>
      {excludedCount ? (
        <p className="phase-note review-exclusion-note">
          {t("excludedNotice", {
            count: excludedCount,
            formattedCount: formatNumber(excludedCount, language),
          })}
        </p>
      ) : null}
      <div className="review-desk-actions">
        <button className="ghost-button" type="button" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" />
          {tc("back")}
        </button>
        <button className="primary-button" type="button" disabled={!selectable.length} onClick={onNext}>
          {t("next")}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </main>
  );
}

interface DetailProps {
  item: ScheduleItem;
  document: TimetableDocument;
  duplicates: Set<string>;
  invalidRanges: Set<string>;
  update: (id: string, patch: Partial<ScheduleItem>) => void;
  duplicate: (item: ScheduleItem) => void;
  remove: (id: string) => void;
  t: TFunction<"review">;
  tc: TFunction<"common">;
  confirmAndNext: () => void;
}
function ScheduleDetails({
  item,
  document,
  duplicates,
  invalidRanges,
  update,
  duplicate,
  remove,
  t,
  tc,
  confirmAndNext,
}: DetailProps) {
  const valid = canVerifySchedule(document, item);
  return (
    <div className={`detail-form ${item.confidence === "low" ? "low-confidence-fields" : ""}`}>
      {item.confidence === "low" ? <p className="low-confidence-notice">{t("lowConfidenceNotice")}</p> : null}
      <label>
        <span>{t("artist")}</span>
        <input
          aria-label={t("artist")}
          value={item.artist}
          onChange={(e) => update(item.id, { artist: e.target.value })}
        />
        {duplicates.has(item.id) ? <small className="cell-warning">{t("duplicateWarning")}</small> : null}
      </label>
      <label>
        <span>{t("type")}</span>
        <select
          aria-label={t("type")}
          value={item.type}
          onChange={(e) => update(item.id, { type: e.target.value as ScheduleItem["type"] })}
        >
          {scheduleTypes.map((value) => (
            <option key={value} value={value}>
              {tc(`scheduleTypes.${value}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{t("scheduleDate")}</span>
        <input
          aria-label={t("scheduleDate")}
          type="date"
          value={item.date ?? ""}
          onChange={(e) => update(item.id, { date: e.target.value || null })}
        />
      </label>
      <div className="detail-time-grid">
        <label>
          <span>{t("scheduleStart")}</span>
          <input
            aria-label={t("scheduleStart")}
            type="time"
            value={item.startTime ?? ""}
            onChange={(e) => update(item.id, { startTime: e.target.value || null })}
          />
        </label>
        <label>
          <span>{t("scheduleEnd")}</span>
          <input
            aria-label={t("scheduleEnd")}
            type="time"
            value={item.endTime ?? ""}
            onChange={(e) =>
              update(item.id, {
                endTime: e.target.value || null,
                endTimeSource: e.target.value ? "manual" : "missing",
              })
            }
          />
        </label>
      </div>
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
          onChange={(e) => update(item.id, { endsNextDay: e.target.checked })}
        />
        <span>{t("nextDay")}</span>
      </label>
      {invalidRanges.has(item.id) ? <small className="cell-warning">{t("invalidRange")}</small> : null}
      <label>
        <span>{t("relativeTime")}</span>
        <input
          aria-label={t("relativeTime")}
          value={item.relativeTimeLabel ?? ""}
          onChange={(e) => update(item.id, { relativeTimeLabel: e.target.value || null })}
          placeholder={t("relativePlaceholder")}
        />
      </label>
      <div className="detail-time-grid">
        <label>
          <span>{t("stage")}</span>
          <input
            aria-label={t("stage")}
            value={item.stage ?? ""}
            onChange={(e) => update(item.id, { stage: e.target.value || null })}
          />
        </label>
        <label>
          <span>{t("booth")}</span>
          <input
            aria-label={t("booth")}
            value={item.booth ?? ""}
            onChange={(e) => update(item.id, { booth: e.target.value || null })}
          />
        </label>
      </div>
      <details className="review-extra">
        <summary>{t("attributes")}</summary>
        <label>
          <span>{t("attributes")}</span>
          <textarea
            aria-label={t("attributes")}
            value={formatAttributes(item.attributes, {
              unknown: tc("attribute.unknown"),
              yes: tc("attribute.yes"),
              no: tc("attribute.no"),
            })}
            onChange={(e) =>
              update(item.id, {
                attributes: parseAttributes(e.target.value, {
                  yes: tc("attribute.yes"),
                  no: tc("attribute.no"),
                }),
              })
            }
            placeholder={t("attributesPlaceholder")}
          />
        </label>
      </details>
      {!valid ? <p className="detail-error">{t("cannotVerify")}</p> : null}
      <label className="check-label">
        <input
          aria-label={t("markVerified", { artist: item.artist || t("scheduleFallback") })}
          type="checkbox"
          checked={item.verified}
          disabled={!valid}
          onChange={(e) => update(item.id, { verified: e.target.checked })}
        />
        <span>{t("verified")}</span>
      </label>
      <button
        className="primary-button review-confirm"
        type="button"
        disabled={!valid || item.verified}
        onClick={confirmAndNext}
      >
        <CheckCheck size={18} aria-hidden="true" />
        {t("confirmNext")}
      </button>
      <div className="detail-actions">
        <button type="button" className="text-button" onClick={() => duplicate(item)}>
          <Copy size={15} /> {t("duplicate", { artist: item.artist || t("scheduleFallback") })}
        </button>
        <button type="button" className="text-button danger" onClick={() => remove(item.id)}>
          <Trash2 size={15} /> {t("delete", { artist: item.artist || t("scheduleFallback") })}
        </button>
      </div>
    </div>
  );
}

function OcrEvidence({ region, t }: { region: OcrTextRegion; t: TFunction<"review"> }) {
  return (
    <div className="ocr-evidence-item">
      <p>{region.text}</p>
      <small>
        {t("ocrOrder", { order: region.order + 1 })} · {t("ocrConfidence")}:{" "}
        {formatOcrConfidence(region.confidence)}
      </small>
    </div>
  );
}

function formatOcrConfidence(confidence: number | null): string {
  return confidence === null ? "—" : `${Math.round(confidence * 100)}%`;
}

function regionsOverlap(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
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
