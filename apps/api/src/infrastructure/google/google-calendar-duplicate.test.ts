import { describe, expect, it, vi } from "vitest";
import type {
  CalendarConnectionCredentials,
  CalendarEventCreateInput,
} from "../../application/ports/calendar-provider.js";
import {
  createGoogleEventId,
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

describe("GoogleCalendarAdapterの決定的Event ID", () => {
  it("同じIDが既に存在する409を作成済み成功として扱う", async () => {
    const insertEvent = vi.fn(async () => {
      throw new GoogleCalendarApiError("DUPLICATE", "event already exists");
    });
    const api: GoogleCalendarApi = {
      refreshAccessToken: vi.fn(),
      insertEvent,
    };
    const adapter = new GoogleCalendarAdapter(api, {
      nowEpochSeconds: () => 1_700_000_000,
    });

    await expect(adapter.createEvent(input, credentials)).resolves.toEqual({
      externalEventId: createGoogleEventId(input),
      credentialUpdate: null,
    });
    expect(insertEvent).toHaveBeenCalledOnce();
  });

  it("Physical Calendarが異なればEvent IDも異なる", () => {
    expect(createGoogleEventId(input)).not.toBe(
      createGoogleEventId({ ...input, physicalCalendarId: "pcal-private" }),
    );
  });
});
