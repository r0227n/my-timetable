import { scheduleTypeLabels, type ScheduleItem, type TimetableDocument } from "../domain/timetable";

export interface GoogleCalendarEvent {
  summary: string;
  location?: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
}

export interface GoogleCalendarAdapter {
  authorize(): Promise<string>;
  insertEvent(accessToken: string, event: GoogleCalendarEvent): Promise<void>;
}

export interface CalendarRegistrationResult {
  scheduleId: string;
  success: boolean;
  message: string;
}

export async function registerSchedulesWithGoogleCalendar(
  document: TimetableDocument,
  schedules: ScheduleItem[],
  adapter: GoogleCalendarAdapter,
): Promise<CalendarRegistrationResult[]> {
  if (!document.event.date) throw new Error("Google Calendar登録には開催日が必要です。");
  const registerable = schedules.filter(isCalendarScheduleRegisterable);
  const accessToken = registerable.length ? await adapter.authorize() : "";
  return await Promise.all(
    registerable.map(async (schedule): Promise<CalendarRegistrationResult> => {
      try {
        await adapter.insertEvent(accessToken, toGoogleEvent(document, schedule));
        return { scheduleId: schedule.id, success: true, message: "登録しました" };
      } catch (error) {
        return {
          scheduleId: schedule.id,
          success: false,
          message: error instanceof Error ? error.message : "登録に失敗しました",
        };
      }
    }),
  );
}

export function createBrowserGoogleCalendarAdapter(clientId: string): GoogleCalendarAdapter {
  return {
    async authorize() {
      await loadGoogleIdentityServices();
      return await new Promise<string>((resolve, reject) => {
        const tokenClient = window.google!.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: "https://www.googleapis.com/auth/calendar.events",
          callback: (response) => {
            if (response.error || !response.access_token) {
              reject(
                new Error(
                  response.error_description || response.error || "Google認証を完了できませんでした。",
                ),
              );
              return;
            }
            resolve(response.access_token);
          },
          error_callback: () => reject(new Error("Google認証がキャンセルされました。")),
        });
        tokenClient.requestAccessToken({ prompt: "consent" });
      });
    },
    async insertEvent(accessToken, event) {
      const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      });
      if (!response.ok) throw new Error(`Google Calendarへの登録に失敗しました (${response.status})`);
    },
  };
}

function toGoogleEvent(document: TimetableDocument, schedule: ScheduleItem): GoogleCalendarEvent {
  const date = document.event.date!;
  const location = schedule.stage ?? schedule.booth ?? document.event.venue ?? undefined;
  return {
    summary: `${schedule.artist} - ${scheduleTypeLabels[schedule.type]}`,
    ...(location ? { location } : {}),
    description: [document.event.name, scheduleTypeLabels[schedule.type], ...document.event.notes]
      .filter(Boolean)
      .join("\n"),
    start: { dateTime: `${date}T${schedule.startTime}:00`, timeZone: document.event.timezone },
    end: { dateTime: `${date}T${schedule.endTime}:00`, timeZone: document.event.timezone },
  };
}

export function isCalendarScheduleRegisterable(
  schedule: ScheduleItem,
): schedule is ScheduleItem & { startTime: string; endTime: string } {
  return Boolean(schedule.startTime && schedule.endTime && schedule.endTime > schedule.startTime);
}

export function selectFailedCalendarSchedules(
  schedules: ScheduleItem[],
  results: CalendarRegistrationResult[],
): ScheduleItem[] {
  const failedIds = new Set(results.filter((result) => !result.success).map((result) => result.scheduleId));
  return schedules.filter(
    (schedule) => failedIds.has(schedule.id) && isCalendarScheduleRegisterable(schedule),
  );
}

let googleScript: Promise<void> | null = null;

function loadGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts.oauth2) return Promise.resolve();
  googleScript ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google認証ライブラリを読み込めませんでした。"));
    document.head.append(script);
  });
  return googleScript;
}

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
            error_callback: () => void;
          }): { requestAccessToken(options: { prompt: string }): void };
        };
      };
    };
  }
}
