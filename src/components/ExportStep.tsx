import { useMemo, useState } from "react";
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

interface ExportStepProps {
  document: TimetableDocument;
  schedules: ScheduleItem[];
  options: TimelineOptions;
  onBack: () => void;
}

export function ExportStep({ document, schedules, options, onBack }: ExportStepProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [googleState, setGoogleState] = useState<"idle" | "confirm" | "working">("idle");
  const [googleResults, setGoogleResults] = useState<CalendarRegistrationResult[]>([]);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const svg = useMemo(() => buildTimelineSvg(document, schedules, options), [document, options, schedules]);
  const fileName = createExportFileName(document);
  const unverifiedLowConfidence = schedules.filter(
    (schedule) => schedule.confidence === "low" && !schedule.verified,
  );
  const registerableSchedules = schedules.filter(isCalendarScheduleRegisterable);
  const failedSchedules = selectFailedCalendarSchedules(schedules, googleResults);
  const saveIcs = () => {
    try {
      const ics = buildIcsCalendar(document, schedules);
      downloadBlob(new Blob([ics], { type: "text/calendar;charset=utf-8" }), `${fileName}.ics`);
      setMessage("ICSを保存しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ICSを保存できませんでした。");
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
      );
      setGoogleResults((current) => {
        if (!preserveResults) return results;
        const merged = new Map(current.map((result) => [result.scheduleId, result]));
        results.forEach((result) => merged.set(result.scheduleId, result));
        return [...merged.values()];
      });
      setMessage("Google Calendarへの登録処理が完了しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Google Calendarへ登録できませんでした。");
    } finally {
      setGoogleState("idle");
    }
  };

  return (
    <main className="workspace-shell export-shell">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">07 / EXPORT</span>
          <h1>タイムラインを書き出す</h1>
          <p>{schedules.length}件の予定を確認して、必要な形式で保存してください。</p>
        </div>
      </div>
      {unverifiedLowConfidence.length ? (
        <div className="export-warning" role="alert">
          low信頼度の未確認予定が{unverifiedLowConfidence.length}
          件あります。元画像と照合してから出力してください。
        </div>
      ) : null}
      <section className="export-grid">
        <article className="panel export-card">
          <h2>画像</h2>
          <p>編集可能なSVG、または高解像度PNGとして保存します。</p>
          <button
            className="primary-button"
            type="button"
            onClick={() =>
              downloadBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), `${fileName}.svg`)
            }
          >
            SVGを保存
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() =>
              void svgToPngBlob(svg, options.width, options.height)
                .then((blob) => {
                  downloadBlob(blob, `${fileName}.png`);
                  setMessage("PNGを保存しました。");
                })
                .catch((error: unknown) =>
                  setMessage(error instanceof Error ? error.message : "PNGを保存できませんでした。"),
                )
            }
          >
            PNGを保存
          </button>
        </article>
        <article className="panel export-card">
          <h2>カレンダー</h2>
          <p>日時が確定した予定を主要カレンダーへ取り込めるICSとして保存します。</p>
          {!document.event.date ? <p className="form-error">ICS出力には開催日を入力してください。</p> : null}
          <button className="primary-button" type="button" disabled={!document.event.date} onClick={saveIcs}>
            ICSを保存
          </button>
        </article>
        <article className="panel export-card">
          <h2>Google Calendar</h2>
          <p>OAuth設定済み環境では、選択した予定を直接登録できます。</p>
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
            Google Calendarへ登録
          </button>
          {!googleClientId ? <small>Google OAuthクライアント設定後に利用できます。</small> : null}
          {googleState === "confirm" ? (
            <fieldset className="calendar-confirm">
              <legend className="sr-only">Google Calendar登録の最終確認</legend>
              <strong>次の{registerableSchedules.length}件をGoogleへ送信します</strong>
              <ul>
                {registerableSchedules.map((schedule) => (
                  <li key={schedule.id}>
                    {schedule.startTime ?? "未定"} {schedule.artist}
                  </li>
                ))}
              </ul>
              <div className="action-row">
                <button className="text-button" type="button" onClick={() => setGoogleState("idle")}>
                  キャンセル
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void registerGoogleCalendar(registerableSchedules)}
                >
                  登録を確定
                </button>
              </div>
            </fieldset>
          ) : null}
          {googleResults.length ? (
            <>
              <ul className="calendar-results" aria-label="Google Calendar登録結果">
                {googleResults.map((result) => {
                  const schedule = schedules.find((item) => item.id === result.scheduleId);
                  return (
                    <li className={result.success ? "success" : "failure"} key={result.scheduleId}>
                      {schedule?.artist ?? result.scheduleId}: {result.message}
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
                  失敗分だけ再試行
                </button>
              ) : null}
            </>
          ) : null}
        </article>
      </section>
      {message ? <output className="export-message">{message}</output> : null}
      <div className="footer-actions">
        <button className="ghost-button" type="button" onClick={onBack}>
          タイムラインへ戻る
        </button>
      </div>
    </main>
  );
}
