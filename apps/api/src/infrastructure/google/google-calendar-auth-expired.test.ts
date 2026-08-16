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
  accessToken: "invalid-access-token",
  refreshToken: "revoked-refresh-token",
  accessTokenExpiresAt: 1_800_000_000,
};

describe("GoogleCalendarAdapterの認証失効", () => {
  it("401後のToken更新も失敗したらAUTH_EXPIREDを返して再試行しない", async () => {
    const insertEvent = vi.fn(async () => {
      throw new GoogleCalendarApiError("AUTH", "invalid credentials");
    });
    const refreshAccessToken = vi.fn(async () => {
      throw new GoogleCalendarApiError("AUTH", "invalid grant");
    });
    const api: GoogleCalendarApi = { refreshAccessToken, insertEvent };
    const adapter = new GoogleCalendarAdapter(api, {
      nowEpochSeconds: () => 1_700_000_000,
      sleep: vi.fn(),
    });

    const error = await adapter
      .createEvent(input, credentials)
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(CalendarProviderError);
    expect(error).toMatchObject({
      name: "CalendarProviderError",
      code: "AUTH_EXPIRED",
    });
    expect(insertEvent).toHaveBeenCalledOnce();
    expect(refreshAccessToken).toHaveBeenCalledWith("revoked-refresh-token");
  });
});
