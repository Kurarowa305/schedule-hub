import { describe, expect, it, vi } from "vitest";
import { CalendarProviderError } from "../../application/errors/calendar-provider-error.js";
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

describe("GoogleCalendarAdapterの再試行上限", () => {
  it("一時障害が続けば3回で停止してRETRY_EXHAUSTEDを返す", async () => {
    const insertEvent = vi.fn(async () => {
      throw new GoogleCalendarApiError("SERVER", "backend error");
    });
    const sleep = vi.fn(async () => undefined);
    const adapter = createAdapter(insertEvent, sleep);

    const error = await adapter
      .createEvent(input, credentials)
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(CalendarProviderError);
    expect(error).toMatchObject({ code: "RETRY_EXHAUSTED" });
    expect(insertEvent).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("恒久エラーは再試行せずREQUEST_FAILEDを返す", async () => {
    const insertEvent = vi.fn(async () => {
      throw new GoogleCalendarApiError("PERMANENT", "bad request");
    });
    const sleep = vi.fn(async () => undefined);
    const adapter = createAdapter(insertEvent, sleep);

    const error = await adapter
      .createEvent(input, credentials)
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(CalendarProviderError);
    expect(error).toMatchObject({ code: "REQUEST_FAILED" });
    expect(insertEvent).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });
});

function createAdapter(
  insertEvent: GoogleCalendarApi["insertEvent"],
  sleep: (milliseconds: number) => Promise<void>,
): GoogleCalendarAdapter {
  return new GoogleCalendarAdapter(
    { refreshAccessToken: vi.fn(), insertEvent },
    {
      nowEpochSeconds: () => 1_700_000_000,
      maxAttempts: 3,
      retryDelayMs: () => 1,
      sleep,
    },
  );
}
