import { describe, expect, it, vi } from "vitest";
import type {
  CalendarConnectionCredentials,
  CalendarEventCreateInput,
} from "../../application/ports/calendar-provider.js";
import {
  GoogleCalendarAdapter,
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

describe("GoogleCalendarAdapterのToken更新", () => {
  it("Access Token期限直前に更新して保存対象を返す", async () => {
    const credentials: CalendarConnectionCredentials = {
      accessToken: "expired-access-token",
      refreshToken: "refresh-token",
      accessTokenExpiresAt: 1_700_000_030,
    };
    const refreshAccessToken = vi.fn(async () => ({
      accessToken: "new-access-token",
      accessTokenExpiresAt: 1_700_003_600,
    }));
    const insertEvent = vi.fn(async () => ({ id: "created-id" }));
    const api: GoogleCalendarApi = { refreshAccessToken, insertEvent };
    const adapter = new GoogleCalendarAdapter(api, {
      nowEpochSeconds: () => 1_700_000_000,
    });

    const result = await adapter.createEvent(input, credentials);

    expect(refreshAccessToken).toHaveBeenCalledOnce();
    expect(refreshAccessToken).toHaveBeenCalledWith("refresh-token");
    expect(insertEvent).toHaveBeenCalledWith(
      "new-access-token",
      expect.any(Object),
    );
    expect(result.credentialUpdate).toEqual({
      accessToken: "new-access-token",
      accessTokenExpiresAt: 1_700_003_600,
    });
  });
});
