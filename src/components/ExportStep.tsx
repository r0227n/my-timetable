import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  buildIcsCalendar,
  buildTimelineSvg,
  createExportFileName,
  type TimelineOptions,
} from "../domain/export";
import type { ScheduleItem, TimetableDocument } from "../domain/timetable";
import { downloadBlob, svgToPngBlob } from "../lib/download";
import {
  createBrowserGoogleCalendarAdapter,
  isCalendarScheduleRegisterable,
  registerSchedulesWithGoogleCalendar,
  selectFailedCalendarSchedules,
  type CalendarRegistrationResult,
} from "../services/google-calendar";
import { localizeError } from "../i18n/errors";
import { useExportLabels } from "../i18n/use-export-labels";
import { formatNumber } from "../i18n/format";
import { currentLanguage } from "../i18n/i18n";

interface ExportStepProps {
  document: TimetableDocument;
  schedules: ScheduleItem[];
  options: TimelineOptions;
  onBack: () => void;
}

export function ExportStep({ document, schedules, options, onBack }: ExportStepProps) {
  const { t } = useTranslation("export");
  const { t: tCommon } = useTranslation("common");
  const labels = useExportLabels();
  const language = currentLanguage();
  const [message, setMessage] = useState<string | null>(null);
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
  const registerableSchedules = schedules.filter(isCalendarScheduleRegisterable);
  const failedSchedules = selectFailedCalendarSchedules(schedules, googleResults);
  const saveIcs = () => {
    try {
      const ics = buildIcsCalendar(document, schedules, labels.scheduleTypes);
      downloadBlob(new Blob([ics], { type: "text/calendar;charset=utf-8" }), `${fileName}.ics`);
      setMessage(t("icsSaved"));
    } catch (error) {
      setMessage(localizeError(error, "icsSaveFailed"));
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
      setMessage(t("registrationComplete"));
    } catch (error) {
      setMessage(localizeError(error, "googleRegistrationFailed"));
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
                  setMessage(t("pngSaved"));
                })
                .catch((error: unknown) => setMessage(localizeError(error, "pngSaveFailed")))
            }
          >
            {t("savePng")}
          </button>
        </article>
        <article className="panel export-card">
          <h2>{t("calendar")}</h2>
          <p>{t("calendarDescription")}</p>
          {!document.event.date ? <p className="form-error">{t("icsDateRequired")}</p> : null}
          <button className="primary-button" type="button" disabled={!document.event.date} onClick={saveIcs}>
            {t("saveIcs")}
          </button>
        </article>
        <article className="panel export-card">
          <h2>Google Calendar</h2>
          <p>{t("googleDescription")}</p>
          <button
            className="ghost-button"
            type="button"
            disabled={
              !googleClientId ||
              !document.event.date ||
              !registerableSchedules.length ||
              googleState === "working"
            }
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
                        : tCommon(`errors.${result.errorCode ?? "googleRegistrationFailed"}`)}
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
      {message ? <output className="export-message">{message}</output> : null}
      <div className="footer-actions">
        <button className="ghost-button" type="button" onClick={onBack}>
          {t("back")}
        </button>
      </div>
    </main>
  );
}
