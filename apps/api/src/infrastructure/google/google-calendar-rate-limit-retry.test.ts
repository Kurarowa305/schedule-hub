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

describe("GoogleCalendarAdapterの一時障害再試行", () => {
  it("429と5xxを指数バックオフして最大試行内で再実行する", async () => {
    const insertEvent = vi
      .fn<GoogleCalendarApi["insertEvent"]>()
      .mockRejectedValueOnce(
        new GoogleCalendarApiError("RATE_LIMIT", "rate limited"),
      )
      .mockRejectedValueOnce(
        new GoogleCalendarApiError("SERVER", "backend error"),
      )
      .mockResolvedValueOnce({ id: "created-id" });
    const sleep = vi.fn(async () => undefined);
    const api: GoogleCalendarApi = {
      refreshAccessToken: vi.fn(),
      insertEvent,
    };
    const adapter = new GoogleCalendarAdapter(api, {
      nowEpochSeconds: () => 1_700_000_000,
      sleep,
      retryDelayMs: (failedAttempt) => failedAttempt * 100,
      maxAttempts: 3,
    });

    await expect(adapter.createEvent(input, credentials)).resolves.toEqual({
      externalEventId: expect.stringMatching(/^[0-9a-v]{64}$/),
      credentialUpdate: null,
    });
    expect(insertEvent).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[100], [200]]);
  });
});
