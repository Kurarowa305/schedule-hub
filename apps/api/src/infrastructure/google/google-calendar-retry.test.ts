import { describe, expect, it, vi } from "vitest";
import type {
  CalendarConnectionCredentials,
  CalendarEventCreateInput,
} from "../../application/ports/calendar-provider.js";
import {
  GoogleCalendarAdapter,
  GoogleCalendarApiError,
  type GoogleCalendarApi,
} from "./google-calendar-adapter.js";

const input: CalendarEventCreateInput = {
  operationId: "op_01HZZZZZZZZZZZZZZZZZZZZZZZ",
  userId: "user-1",
  physicalCalendarId: "pcal-work",
  externalCalendarId: "work@example.com",
  title: "定例会議",
  scheduleType: "TIMED",
  start: "2026-08-17T10:00:00+09:00",
  end: "2026-08-17T11:00:00+09:00",
  timezone: "Asia/Tokyo",
};

const credentials: CalendarConnectionCredentials = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  accessTokenExpiresAt: 1_800_000_000,
};

describe("GoogleCalendarAdapterの再試行", () => {
  it("タイムアウト後に待機して同じ決定的IDで再試行する", async () => {
    const insertEvent = vi
      .fn<GoogleCalendarApi["insertEvent"]>()
      .mockRejectedValueOnce(
        new GoogleCalendarApiError("TIMEOUT", "request timed out"),
      )
      .mockImplementationOnce(async (_token, request) => ({
        id: request.event.id,
      }));
    const sleep = vi.fn(async () => undefined);
    const api: GoogleCalendarApi = {
      refreshAccessToken: vi.fn(),
      insertEvent,
    };
    const adapter = new GoogleCalendarAdapter(api, {
      nowEpochSeconds: () => 1_700_000_000,
      sleep,
      retryDelayMs: () => 100,
    });

    const result = await adapter.createEvent(input, credentials);

    expect(insertEvent).toHaveBeenCalledTimes(2);
    expect(insertEvent.mock.calls[0]?.[1].event.id).toBe(
      insertEvent.mock.calls[1]?.[1].event.id,
    );
    expect(sleep).toHaveBeenCalledWith(100);
    expect(result.externalEventId).toBe(
      insertEvent.mock.calls[1]?.[1].event.id,
    );
  });
});
