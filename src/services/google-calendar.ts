import { AppError, errorCode, errorDetails, type AppErrorCode } from "../domain/errors";
import {
  resolveScheduleDate,
  type ScheduleItem,
  type ScheduleType,
  type TimetableDocument,
} from "../domain/timetable";

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
  clearAuthorization?(): void;
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
  try {
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
  } finally {
    adapter.clearAuthorization?.();
  }
}

export function createBrowserGoogleCalendarAdapter(clientId: string): GoogleCalendarAdapter {
  const authorization = new MemoryAuthorization();
  return {
    async authorize() {
      authorization.clear();
      await loadGoogleIdentityServices();
      return await new Promise<string>((resolve, reject) => {
        const tokenClient = window.google!.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: "https://www.googleapis.com/auth/calendar.events",
          callback: (response) => {
            if (response.error || !response.access_token) {
              authorization.clear();
              reject(new AppError("googleAuthFailed"));
              return;
            }
            authorization.set(response.access_token, response.expires_in);
            resolve(authorization.requireActive());
          },
          error_callback: () => {
            authorization.clear();
            reject(new AppError("googleAuthCancelled"));
          },
        });
        tokenClient.requestAccessToken({ prompt: "consent" });
      });
    },
    async insertEvent(accessToken, event) {
      if (authorization.requireActive() !== accessToken) throw new AppError("googleAuthFailed");
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
    clearAuthorization() {
      authorization.clear();
    },
  };
}

class MemoryAuthorization {
  private accessToken: string | null = null;
  private expiresAt = 0;

  set(accessToken: string, expiresInSeconds: number | undefined): void {
    this.accessToken = accessToken;
    this.expiresAt = Date.now() + Math.max(0, expiresInSeconds ?? 0) * 1_000;
  }

  requireActive(): string {
    if (!this.accessToken || Date.now() >= this.expiresAt) {
      this.clear();
      throw new AppError("googleAuthFailed");
    }
    return this.accessToken;
  }

  clear(): void {
    this.accessToken = null;
    this.expiresAt = 0;
  }
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
  return Boolean(
    (!document || resolveScheduleDate(document, schedule)) &&
    schedule.startTime &&
    schedule.endTime &&
    (["explicit", "manual"].includes(schedule.endTimeSource) || schedule.verified) &&
    (schedule.endsNextDay || schedule.endTime > schedule.startTime),
  );
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
  expires_in?: number;
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
