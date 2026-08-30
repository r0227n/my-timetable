import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBlankSchedule, createEmptyDocument } from "../domain/timetable";
import { AppError } from "../domain/errors";
import {
  registerSchedulesWithGoogleCalendar,
  createBrowserGoogleCalendarAdapter,
  selectFailedCalendarSchedules,
  type GoogleCalendarAdapter,
} from "./google-calendar";

const scheduleTypeLabels = { live: "LIVE", meet_and_greet: "Meet & Greet", merch: "Merch", other: "Other" };
type InitTokenClient = NonNullable<Window["google"]>["accounts"]["oauth2"]["initTokenClient"];

describe("Google Calendar registration", () => {
  beforeEach(() => {
    delete window.google;
    document.head
      .querySelectorAll('script[src="https://accounts.google.com/gsi/client"]')
      .forEach((script) => script.remove());
    vi.restoreAllMocks();
  });

  it("registers timed schedules and reports untimed schedules separately", async () => {
    const document = {
      ...createEmptyDocument(),
      event: { ...createEmptyDocument().event, name: "Festival", date: "2026-08-27", venue: "Hall" },
    };
    const timed = createBlankSchedule({
      id: "timed",
      artist: "Artist A",
      startTime: "10:00",
      endTime: "10:30",
      stage: "Stage 1",
    });
    const untimed = createBlankSchedule({ id: "untimed", artist: "Artist B" });
    const insertEvent = vi.fn<GoogleCalendarAdapter["insertEvent"]>(async () => undefined);
    const adapter: GoogleCalendarAdapter = {
      authorize: async () => "memory-only-token",
      insertEvent,
    };

    const results = await registerSchedulesWithGoogleCalendar(
      document,
      [timed, untimed],
      adapter,
      scheduleTypeLabels,
    );

    expect(insertEvent).toHaveBeenCalledWith(
      "memory-only-token",
      expect.objectContaining({
        summary: "Artist A - LIVE",
        start: { dateTime: "2026-08-27T10:00:00", timeZone: "Asia/Tokyo" },
      }),
    );
    expect(results).toEqual([{ scheduleId: "timed", success: true, messageCode: "registrationSuccess" }]);
  });

  it("selects only failed registerable schedules for retry", () => {
    const failed = createBlankSchedule({ id: "failed", startTime: "10:00", endTime: "10:30" });
    const succeeded = createBlankSchedule({ id: "succeeded", startTime: "11:00", endTime: "11:30" });
    const untimed = createBlankSchedule({ id: "untimed" });

    expect(
      selectFailedCalendarSchedules(
        [failed, succeeded, untimed],
        [
          { scheduleId: "failed", success: false, messageCode: "registrationFailed" },
          { scheduleId: "succeeded", success: true, messageCode: "registrationSuccess" },
          { scheduleId: "untimed", success: false, messageCode: "registrationFailed" },
        ],
      ),
    ).toEqual([failed]);
  });

  it("preserves interpolation details from Google Calendar failures", async () => {
    const document = {
      ...createEmptyDocument(),
      event: { ...createEmptyDocument().event, date: "2026-08-27" },
    };
    const schedule = createBlankSchedule({ id: "failed", startTime: "10:00", endTime: "10:30" });

    const results = await registerSchedulesWithGoogleCalendar(
      document,
      [schedule],
      {
        authorize: async () => "token",
        insertEvent: async () => {
          throw new AppError("googleInsertFailed", { status: 429 });
        },
      },
      scheduleTypeLabels,
    );

    expect(results[0]).toMatchObject({
      scheduleId: "failed",
      success: false,
      errorCode: "googleInsertFailed",
      errorDetails: { status: 429 },
    });
  });

  it("registers an explicitly confirmed overnight schedule on the following date", async () => {
    const document = {
      ...createEmptyDocument(),
      event: { ...createEmptyDocument().event, date: "2026-08-27" },
    };
    const overnight = createBlankSchedule({
      id: "overnight",
      startTime: "23:30",
      endTime: "00:30",
      endsNextDay: true,
    });
    const insertEvent = vi.fn<GoogleCalendarAdapter["insertEvent"]>(async () => undefined);

    await registerSchedulesWithGoogleCalendar(
      document,
      [overnight],
      {
        authorize: async () => "token",
        insertEvent,
      },
      scheduleTypeLabels,
    );

    expect(insertEvent).toHaveBeenCalledWith(
      "token",
      expect.objectContaining({ end: { dateTime: "2026-08-28T00:30:00", timeZone: "Asia/Tokyo" } }),
    );
  });

  it("registers a schedule using its per-item date", async () => {
    const document = createEmptyDocument();
    const schedule = createBlankSchedule({
      date: "2026-10-12",
      startTime: "11:00",
      endTime: "11:30",
    });
    const insertEvent = vi.fn<GoogleCalendarAdapter["insertEvent"]>(async () => undefined);

    await registerSchedulesWithGoogleCalendar(
      document,
      [schedule],
      { authorize: async () => "token", insertEvent },
      scheduleTypeLabels,
    );

    expect(insertEvent).toHaveBeenCalledWith(
      "token",
      expect.objectContaining({ start: { dateTime: "2026-10-12T11:00:00", timeZone: "Asia/Tokyo" } }),
    );
  });

  it("requests only the calendar.events scope and clears authorization after registration", async () => {
    const clearAuthorization = vi.fn<() => void>();
    const document = {
      ...createEmptyDocument(),
      event: { ...createEmptyDocument().event, date: "2026-08-27" },
    };
    const schedule = createBlankSchedule({ startTime: "10:00", endTime: "10:30" });

    await registerSchedulesWithGoogleCalendar(
      document,
      [schedule],
      { authorize: async () => "token", insertEvent: async () => undefined, clearAuthorization },
      scheduleTypeLabels,
    );

    expect(clearAuthorization).toHaveBeenCalledOnce();
  });

  it("uses the GIS token client and never persists its access token", async () => {
    let tokenConfig:
      | Parameters<NonNullable<Window["google"]>["accounts"]["oauth2"]["initTokenClient"]>[0]
      | undefined;
    const requestAccessToken = vi.fn<(options: { prompt: string }) => void>(() =>
      tokenConfig?.callback({ access_token: "memory-only-token", expires_in: 3600 }),
    );
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn<InitTokenClient>((config) => {
            tokenConfig = config;
            return { requestAccessToken };
          }),
        },
      },
    };
    const storageSet = vi.spyOn(Storage.prototype, "setItem");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const adapter = createBrowserGoogleCalendarAdapter("public-client-id.apps.googleusercontent.com");

    const token = await adapter.authorize();
    await adapter.insertEvent(token, {
      summary: "Artist - LIVE",
      description: "Festival",
      start: { dateTime: "2026-08-27T10:00:00", timeZone: "Asia/Tokyo" },
      end: { dateTime: "2026-08-27T10:30:00", timeZone: "Asia/Tokyo" },
    });

    expect(tokenConfig?.scope).toBe("https://www.googleapis.com/auth/calendar.events");
    expect(requestAccessToken).toHaveBeenCalledWith({ prompt: "consent" });
    expect(storageSet).not.toHaveBeenCalledWith(expect.any(String), "memory-only-token");
    adapter.clearAuthorization?.();
    await expect(adapter.insertEvent(token, expect.any(Object))).rejects.toMatchObject({
      code: "googleAuthFailed",
    });
  });

  it("clears a previous token before a cancelled authorization attempt", async () => {
    let tokenConfig:
      | Parameters<NonNullable<Window["google"]>["accounts"]["oauth2"]["initTokenClient"]>[0]
      | undefined;
    let cancelNext = false;
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn<InitTokenClient>((config) => {
            tokenConfig = config;
            return {
              requestAccessToken: () => {
                if (cancelNext) tokenConfig?.error_callback();
                else tokenConfig?.callback({ access_token: "old-token", expires_in: 3600 });
              },
            };
          }),
        },
      },
    };
    const adapter = createBrowserGoogleCalendarAdapter("public-client-id.apps.googleusercontent.com");
    const oldToken = await adapter.authorize();
    cancelNext = true;

    await expect(adapter.authorize()).rejects.toMatchObject({ code: "googleAuthCancelled" });
    await expect(adapter.insertEvent(oldToken, expect.any(Object))).rejects.toMatchObject({
      code: "googleAuthFailed",
    });
  });

  it("rejects an expired GIS token before sending a Calendar request", async () => {
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: (config) => ({
            requestAccessToken: () => config.callback({ access_token: "expired-token", expires_in: 0 }),
          }),
        },
      },
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const adapter = createBrowserGoogleCalendarAdapter("public-client-id.apps.googleusercontent.com");

    await expect(adapter.authorize()).rejects.toMatchObject({ code: "googleAuthFailed" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
