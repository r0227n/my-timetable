import { AlertTriangle, Check, Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { detectConflicts, findInvalidTimeRangeIds } from "../domain/conflicts";
import {
  resolveScheduleDate,
  scheduleTypes,
  type ScheduleType,
  type TimetableDocument,
} from "../domain/timetable";
import { formatNumber } from "../i18n/format";
import { currentLanguage } from "../i18n/i18n";

interface SelectionStepProps {
  document: TimetableDocument;
  selected: Set<string>;
  onSelectedChange: (selected: Set<string>) => void;
  onBack: () => void;
  onNext: () => void;
}

export function SelectionStep({ document, selected, onSelectedChange, onBack, onNext }: SelectionStepProps) {
  const { t } = useTranslation("selection");
  const { t: tCommon } = useTranslation("common");
  const language = currentLanguage();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [type, setType] = useState<ScheduleType | "all">("all");
  const [stage, setStage] = useState("all");
  const [buffer, setBuffer] = useState(10);
  const stages = useMemo(
    () => [...new Set(document.schedules.map((item) => item.stage).filter(Boolean))] as string[],
    [document.schedules],
  );
  const filtered = useMemo(
    () =>
      document.schedules.filter(
        (item) =>
          item.artist.toLocaleLowerCase().includes(deferredQuery.toLocaleLowerCase()) &&
          (type === "all" || item.type === type) &&
          (stage === "all" || item.stage === stage),
      ),
    [deferredQuery, document.schedules, stage, type],
  );
  const selectedItems = document.schedules.filter((item) => selected.has(item.id));
  const conflicts = detectConflicts(selectedItems, buffer, document.event.date);
  const invalidTimeRanges = findInvalidTimeRangeIds(selectedItems);
  const conflictIds = new Set([
    ...conflicts.flatMap((item) => [item.firstId, item.secondId]),
    ...invalidTimeRanges,
  ]);
  const artists = [...new Set(filtered.map((item) => item.artist))];

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  };
  const toggleArtist = (artist: string) => {
    const ids = document.schedules.filter((item) => item.artist === artist).map((item) => item.id);
    const allSelected = ids.every((id) => selected.has(id));
    const next = new Set(selected);
    ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
    onSelectedChange(next);
  };

  return (
    <main className="workspace-shell selection-shell">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">05 / SELECT</span>
          <h1>{t("heading")}</h1>
          <p>{t("description")}</p>
        </div>
        <div className="selected-badge">
          <strong>{formatNumber(selected.size, language)}</strong>
          <span>{t("selectedLabel")}</span>
        </div>
      </div>
      <section className="filter-bar panel">
        <label className="search-field">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
          />
        </label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as ScheduleType | "all")}
          aria-label={t("typeFilter")}
        >
          <option value="all">{t("allTypes")}</option>
          {scheduleTypes.map((value) => (
            <option key={value} value={value}>
              {tCommon(`scheduleTypes.${value}`)}
            </option>
          ))}
        </select>
        <select value={stage} onChange={(e) => setStage(e.target.value)} aria-label={t("stageFilter")}>
          <option value="all">{t("allStages")}</option>
          {stages.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <button
          className="small-button"
          type="button"
          onClick={() => onSelectedChange(new Set([...selected, ...filtered.map((item) => item.id)]))}
        >
          {t("selectVisible")}
        </button>
        <button className="text-button" type="button" onClick={() => onSelectedChange(new Set())}>
          {t("clearAll")}
        </button>
      </section>
      <div className="selection-layout">
        <section className="artist-list">
          {artists.length ? (
            artists.map((artist) => {
              const items = filtered.filter((item) => item.artist === artist);
              const allSelected = items.every((item) => selected.has(item.id));
              return (
                <article className="artist-group panel" key={artist}>
                  <header>
                    <label className="artist-check">
                      <input type="checkbox" checked={allSelected} onChange={() => toggleArtist(artist)} />
                      <span className="custom-check">{allSelected ? <Check size={14} /> : null}</span>
                      <strong>{artist || t("unnamed")}</strong>
                    </label>
                    <span>
                      {t("artistScheduleCount", {
                        count: items.length,
                        formattedCount: formatNumber(items.length, language),
                      })}
                    </span>
                  </header>
                  <div className="schedule-cards">
                    {items
                      .toSorted((a, b) =>
                        `${resolveScheduleDate(document, a) ?? "9999"} ${a.startTime ?? "99:99"}`.localeCompare(
                          `${resolveScheduleDate(document, b) ?? "9999"} ${b.startTime ?? "99:99"}`,
                        ),
                      )
                      .map((item) => (
                        <label
                          className={`schedule-card ${selected.has(item.id) ? "selected" : ""} ${conflictIds.has(item.id) ? "conflict" : ""}`}
                          key={item.id}
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(item.id)}
                            onChange={() => toggle(item.id)}
                          />
                          <span className={`type-stripe ${item.type}`} />
                          <span className="schedule-time">
                            <small>{resolveScheduleDate(document, item) ?? tCommon("unset")}</small>
                            {item.startTime ?? tCommon("unset")}
                            <small>{item.endTime ? `– ${item.endTime}` : ""}</small>
                          </span>
                          <span className="schedule-meta">
                            <strong>{tCommon(`scheduleTypes.${item.type}`)}</strong>
                            <small>
                              {[item.stage, item.booth].filter(Boolean).join(" / ") || t("unsetPlace")}
                            </small>
                          </span>
                          {conflictIds.has(item.id) ? (
                            <AlertTriangle
                              size={18}
                              aria-label={invalidTimeRanges.has(item.id) ? t("invalidRange") : t("overlap")}
                            />
                          ) : null}
                        </label>
                      ))}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="empty-state panel">{t("empty")}</div>
          )}
        </section>
        <aside className="selection-summary panel">
          <span className="eyebrow">{t("summaryEyebrow")}</span>
          <h2>{t("summary")}</h2>
          {selectedItems.length ? (
            <ol>
              {selectedItems
                .toSorted((a, b) =>
                  `${resolveScheduleDate(document, a) ?? "9999"} ${a.startTime ?? "99:99"}`.localeCompare(
                    `${resolveScheduleDate(document, b) ?? "9999"} ${b.startTime ?? "99:99"}`,
                  ),
                )
                .map((item) => (
                  <li key={item.id}>
                    <time>
                      {resolveScheduleDate(document, item) ?? tCommon("unset")}{" "}
                      {item.startTime ?? tCommon("unset")}
                    </time>
                    <span>
                      <strong>{item.artist}</strong>
                      <small>
                        {tCommon(scheduleTypeKey(item.type))} · {item.stage ?? item.booth ?? t("unsetPlace")}
                      </small>
                    </span>
                  </li>
                ))}
            </ol>
          ) : (
            <p className="muted">{t("choosePrompt")}</p>
          )}
          <label className="buffer-control">
            <span>{t("buffer")}</span>
            <select value={buffer} onChange={(e) => setBuffer(Number(e.target.value))}>
              <option value={0}>{t("noBuffer")}</option>
              {[5, 10, 15, 30].map((minutes) => (
                <option value={minutes} key={minutes}>
                  {t("minutes", { count: minutes, formattedCount: formatNumber(minutes, language) })}
                </option>
              ))}
            </select>
          </label>
          {conflicts.length || invalidTimeRanges.size ? (
            <div className="conflict-box">
              <AlertTriangle size={18} />
              <span>
                <strong>
                  {t("warningCount", {
                    count: conflicts.length + invalidTimeRanges.size,
                    formattedCount: formatNumber(conflicts.length + invalidTimeRanges.size, language),
                  })}
                </strong>
                {invalidTimeRanges.size ? t("invalidRangeSummary") : t("conflictSummary")}
              </span>
            </div>
          ) : selected.size ? (
            <div className="safe-box">
              <Check size={17} /> {t("noConflict")}
            </div>
          ) : null}
        </aside>
      </div>
      <div className="footer-actions">
        <button className="ghost-button" type="button" onClick={onBack}>
          {t("back")}
        </button>
        <button className="primary-button" type="button" disabled={!selected.size} onClick={onNext}>
          {t("next")}
        </button>
      </div>
    </main>
  );
}

function scheduleTypeKey(type: ScheduleType): `scheduleTypes.${ScheduleType}` {
  return `scheduleTypes.${type}`;
}
