import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  buildIcsCalendar,
  buildTimelineSvg,
  createExportFileName,
  isCalendarScheduleExportable,
  type TimelineOptions,
} from "../domain/export";
import type { ScheduleItem, TimetableDocument } from "../domain/timetable";
import { downloadBlob, svgToPngBlob } from "../lib/download";
import {
  createBrowserGoogleCalendarAdapter,
  registerSchedulesWithGoogleCalendar,
  selectFailedCalendarSchedules,
  type CalendarRegistrationResult,
} from "../services/google-calendar";
import { localizeError } from "../i18n/errors";
import { useExportLabels } from "../i18n/use-export-labels";
import { formatNumber } from "../i18n/format";
import { currentLanguage } from "../i18n/i18n";
import type { AppErrorCode } from "../domain/errors";

interface ExportStepProps {
  document: TimetableDocument;
  schedules: ScheduleItem[];
  options: TimelineOptions;
  onBack: () => void;
}

type ExportMessage =
  | { type: "translation"; key: "icsSaved" | "registrationComplete" | "pngSaved" }
  | { type: "error"; error: unknown; fallback: AppErrorCode };

export function ExportStep({ document, schedules, options, onBack }: ExportStepProps) {
  const { t } = useTranslation("export");
  const { t: tCommon } = useTranslation("common");
  const labels = useExportLabels();
  const language = currentLanguage();
  const [message, setMessage] = useState<ExportMessage | null>(null);
  const [googleState, setGoogleState] = useState<"idle" | "confirm" | "working">("idle");
  const [googleResults, setGoogleResults] = useState<CalendarRegistrationResult[]>([]);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const svg = useMemo(
    () => buildTimelineSvg(document, schedules, options, labels),
    [document, labels, options, schedules],
  );
  const fileName = createExportFileName(document);
  const unverifiedLowConfidence = schedules.filter(
    (schedule) => schedule.confidence === "low" && !schedule.verified,
  );
  const registerableSchedules = schedules.filter((schedule) =>
    isCalendarScheduleExportable(schedule, document),
  );
  const excludedCalendarCount = schedules.length - registerableSchedules.length;
  const hasMissingDates = schedules.some((schedule) => !schedule.date && !document.event.date);
  const failedSchedules = selectFailedCalendarSchedules(schedules, googleResults);
  const saveIcs = () => {
    try {
      const ics = buildIcsCalendar(document, schedules, labels.scheduleTypes);
      downloadBlob(new Blob([ics], { type: "text/calendar;charset=utf-8" }), `${fileName}.ics`);
      setMessage({ type: "translation", key: "icsSaved" });
    } catch (error) {
      setMessage({ type: "error", error, fallback: "icsSaveFailed" });
    }
  };
  const registerGoogleCalendar = async (
    targets: ScheduleItem[] = registerableSchedules,
    preserveResults = false,
  ) => {
    if (!googleClientId) return;
    setGoogleState("working");
    if (!preserveResults) setGoogleResults([]);
    try {
      const results = await registerSchedulesWithGoogleCalendar(
        document,
        targets,
        createBrowserGoogleCalendarAdapter(googleClientId),
        labels.scheduleTypes,
      );
      setGoogleResults((current) => {
        if (!preserveResults) return results;
        const merged = new Map(current.map((result) => [result.scheduleId, result]));
        results.forEach((result) => merged.set(result.scheduleId, result));
        return [...merged.values()];
      });
      setMessage({ type: "translation", key: "registrationComplete" });
    } catch (error) {
      setMessage({ type: "error", error, fallback: "googleRegistrationFailed" });
    } finally {
      setGoogleState("idle");
    }
  };

  return (
    <main className="workspace-shell export-shell">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">07 / EXPORT</span>
          <h1>{t("heading")}</h1>
          <p>
            {t("description", {
              count: schedules.length,
              formattedCount: formatNumber(schedules.length, language),
            })}
          </p>
        </div>
      </div>
      {unverifiedLowConfidence.length ? (
        <div className="export-warning" role="alert">
          {t("lowConfidenceWarning", {
            count: unverifiedLowConfidence.length,
            formattedCount: formatNumber(unverifiedLowConfidence.length, language),
            confidence: tCommon("confidence.low"),
          })}
        </div>
      ) : null}
      <section className="export-grid">
        <article className="panel export-card">
          <h2>{t("image")}</h2>
          <p>{t("imageDescription")}</p>
          <button
            className="primary-button"
            type="button"
            onClick={() =>
              downloadBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), `${fileName}.svg`)
            }
          >
            {t("saveSvg")}
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() =>
              void svgToPngBlob(svg, options.width, options.height)
                .then((blob) => {
                  downloadBlob(blob, `${fileName}.png`);
                  setMessage({ type: "translation", key: "pngSaved" });
                })
                .catch((error: unknown) => setMessage({ type: "error", error, fallback: "pngSaveFailed" }))
            }
          >
            {t("savePng")}
          </button>
        </article>
        <article className="panel export-card">
          <h2>{t("calendar")}</h2>
          <p>{t("calendarDescription")}</p>
          <p>
            {t("icsEligibleCount", {
              count: registerableSchedules.length,
              formattedCount: formatNumber(registerableSchedules.length, language),
            })}
          </p>
          {excludedCalendarCount ? (
            <p className="export-warning">
              {t("icsExcludedCount", {
                count: excludedCalendarCount,
                formattedCount: formatNumber(excludedCalendarCount, language),
              })}
            </p>
          ) : null}
          {hasMissingDates ? <p className="form-error">{t("icsDateRequired")}</p> : null}
          <button
            className="primary-button"
            type="button"
            disabled={!registerableSchedules.length}
            onClick={saveIcs}
          >
            {t("saveIcs")}
          </button>
        </article>
        <article className="panel export-card">
          <h2>Google Calendar</h2>
          <p>{t("googleDescription")}</p>
          <button
            className="ghost-button"
            type="button"
            disabled={!googleClientId || !registerableSchedules.length || googleState === "working"}
            onClick={() => setGoogleState("confirm")}
          >
            {t("registerGoogle")}
          </button>
          {!googleClientId ? <small>{t("googleUnavailable")}</small> : null}
          {googleState === "confirm" ? (
            <fieldset className="calendar-confirm">
              <legend className="sr-only">{t("confirmLegend")}</legend>
              <strong>
                {t("confirmCount", {
                  count: registerableSchedules.length,
                  formattedCount: formatNumber(registerableSchedules.length, language),
                })}
              </strong>
              <ul>
                {registerableSchedules.map((schedule) => (
                  <li key={schedule.id}>
                    {schedule.startTime ?? tCommon("unset")} {schedule.artist}
                  </li>
                ))}
              </ul>
              <div className="action-row">
                <button className="text-button" type="button" onClick={() => setGoogleState("idle")}>
                  {t("cancel")}
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void registerGoogleCalendar(registerableSchedules)}
                >
                  {t("confirm")}
                </button>
              </div>
            </fieldset>
          ) : null}
          {googleResults.length ? (
            <>
              <ul className="calendar-results" aria-label={t("results")}>
                {googleResults.map((result) => {
                  const schedule = schedules.find((item) => item.id === result.scheduleId);
                  return (
                    <li className={result.success ? "success" : "failure"} key={result.scheduleId}>
                      {schedule?.artist ?? result.scheduleId}:{" "}
                      {result.success
                        ? t(result.messageCode)
                        : tCommon(
                            `errors.${result.errorCode ?? "googleRegistrationFailed"}`,
                            result.errorDetails,
                          )}
                    </li>
                  );
                })}
              </ul>
              {failedSchedules.length ? (
                <button
                  className="ghost-button"
                  type="button"
                  disabled={googleState === "working"}
                  onClick={() => void registerGoogleCalendar(failedSchedules, true)}
                >
                  {t("retryFailed")}
                </button>
              ) : null}
            </>
          ) : null}
        </article>
      </section>
      {message ? (
        <output className="export-message">
          {message.type === "translation" ? t(message.key) : localizeError(message.error, message.fallback)}
        </output>
      ) : null}
      <div className="footer-actions">
        <button className="ghost-button" type="button" onClick={onBack}>
          {t("back")}
        </button>
      </div>
    </main>
  );
}
