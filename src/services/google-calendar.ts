import { AppError, errorCode, errorDetails, type AppErrorCode } from "../domain/errors";
import {
  resolveScheduleDate,
  type ScheduleItem,
  type ScheduleType,
  type TimetableDocument,
} from "../domain/timetable";
import { isCalendarScheduleExportable } from "../domain/export";

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
  messageCode: "registrationSuccess" | "registrationFailed";
  errorCode?: AppErrorCode;
  errorDetails?: Record<string, string | number>;
}

export async function registerSchedulesWithGoogleCalendar(
  document: TimetableDocument,
  schedules: ScheduleItem[],
  adapter: GoogleCalendarAdapter,
  scheduleTypeLabels: Record<ScheduleType, string>,
): Promise<CalendarRegistrationResult[]> {
  const registerable = schedules.filter((schedule) => isCalendarScheduleRegisterable(schedule, document));
  if (!registerable.length && schedules.some((schedule) => !resolveScheduleDate(document, schedule))) {
    throw new AppError("googleDateRequired");
  }
  const accessToken = registerable.length ? await adapter.authorize() : "";
  return await Promise.all(
    registerable.map(async (schedule): Promise<CalendarRegistrationResult> => {
      try {
        await adapter.insertEvent(accessToken, toGoogleEvent(document, schedule, scheduleTypeLabels));
        return { scheduleId: schedule.id, success: true, messageCode: "registrationSuccess" };
      } catch (error) {
        return {
          scheduleId: schedule.id,
          success: false,
          messageCode: "registrationFailed",
          errorCode: errorCode(error, "googleRegistrationFailed"),
          errorDetails: errorDetails(error),
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
              reject(new AppError("googleAuthFailed"));
              return;
            }
            resolve(response.access_token);
          },
          error_callback: () => reject(new AppError("googleAuthCancelled")),
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
      if (!response.ok) throw new AppError("googleInsertFailed", { status: response.status });
    },
  };
}

function toGoogleEvent(
  document: TimetableDocument,
  schedule: ScheduleItem,
  scheduleTypeLabels: Record<ScheduleType, string>,
): GoogleCalendarEvent {
  const date = resolveScheduleDate(document, schedule)!;
  const endDate = schedule.endsNextDay ? addDays(date, 1) : date;
  const location = schedule.stage ?? schedule.booth ?? document.event.venue ?? undefined;
  return {
    summary: `${schedule.artist} - ${scheduleTypeLabels[schedule.type]}`,
    ...(location ? { location } : {}),
    description: [document.event.name, scheduleTypeLabels[schedule.type], ...document.event.notes]
      .filter(Boolean)
      .join("\n"),
    start: { dateTime: `${date}T${schedule.startTime}:00`, timeZone: document.event.timezone },
    end: { dateTime: `${endDate}T${schedule.endTime}:00`, timeZone: document.event.timezone },
  };
}

export function isCalendarScheduleRegisterable(
  schedule: ScheduleItem,
  document?: TimetableDocument,
): schedule is ScheduleItem & { startTime: string; endTime: string } {
  return isCalendarScheduleExportable(schedule, document);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
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
    script.onerror = () => reject(new AppError("googleScriptLoadFailed"));
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
