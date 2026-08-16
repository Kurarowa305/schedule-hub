import { describe, expect, it, vi } from "vitest";
import type {
  CalendarConnectionCredentials,
  CalendarEventCreateInput,
} from "../../application/ports/calendar-provider.js";
import {
  GoogleCalendarAdapter,
  type GoogleCalendarApi,
  type GoogleEventInsertRequest,
} from "./google-calendar-adapter.js";

const credentials: CalendarConnectionCredentials = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  accessTokenExpiresAt: 1_800_000_000,
};

const timedInput: CalendarEventCreateInput = {
  operationId: "op_01HZZZZZZZZZZZZZZZZZZZZZZZ",
  userId: "user-1",
  physicalCalendarId: "pcal-work",
  externalCalendarId: "work@example.com",
  title: "定例会議",
  location: "会議室A",
  description: "週次の打ち合わせ",
  scheduleType: "TIMED",
  start: "2026-08-17T10:00:00+09:00",
  end: "2026-08-17T11:00:00+09:00",
  timezone: "Asia/Tokyo",
  eventColorId: "5",
  visibility: "private",
  reminders: {
    useDefault: false,
    overrides: [{ method: "popup", minutes: 10 }],
  },
  sendUpdates: "none",
};

describe("GoogleCalendarAdapter", () => {
  it("TIMED予定を決定的IDと設定付きで作成する", async () => {
    const insertEvent = vi.fn(
      async (_accessToken: string, request: GoogleEventInsertRequest) => ({
        id: request.event.id,
      }),
    );
    const api: GoogleCalendarApi = {
      refreshAccessToken: vi.fn(),
      insertEvent,
    };
    const adapter = new GoogleCalendarAdapter(api, {
      nowEpochSeconds: () => 1_700_000_000,
    });

    const result = await adapter.createEvent(timedInput, credentials);

    expect(result.externalEventId).toMatch(/^[0-9a-v]{64}$/);
    expect(result.credentialUpdate).toBeNull();
    expect(insertEvent).toHaveBeenCalledWith("access-token", {
      calendarId: "work@example.com",
      sendUpdates: "none",
      event: {
        id: result.externalEventId,
        summary: "定例会議",
        location: "会議室A",
        description: "週次の打ち合わせ",
        start: {
          dateTime: "2026-08-17T10:00:00+09:00",
          timeZone: "Asia/Tokyo",
        },
        end: {
          dateTime: "2026-08-17T11:00:00+09:00",
          timeZone: "Asia/Tokyo",
        },
        colorId: "5",
        visibility: "private",
        reminders: {
          useDefault: false,
          overrides: [{ method: "popup", minutes: 10 }],
        },
      },
    });
  });
});
