import { describe, expect, it, vi } from "vitest";
import type {
  CalendarConnectionCredentials,
  CalendarEventCreateInput,
} from "../../application/ports/calendar-provider.js";
import {
  GoogleCalendarAdapter,
  type GoogleCalendarApi,
} from "./google-calendar-adapter.js";

const credentials: CalendarConnectionCredentials = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  accessTokenExpiresAt: 1_800_000_000,
};

describe("GoogleCalendarAdapterのALL_DAY変換", () => {
  it("inclusiveな最終日をGoogleのexclusiveな翌日へ変換する", async () => {
    const input: CalendarEventCreateInput = {
      operationId: "op_01HZZZZZZZZZZZZZZZZZZZZZZZ",
      userId: "user-1",
      physicalCalendarId: "pcal-private",
      externalCalendarId: "private@example.com",
      title: "夏休み",
      scheduleType: "ALL_DAY",
      start: "2026-08-14",
      end: "2026-08-16",
      timezone: "Asia/Tokyo",
    };
    const insertEvent = vi.fn(async () => ({ id: "created-id" }));
    const api: GoogleCalendarApi = {
      refreshAccessToken: vi.fn(),
      insertEvent,
    };
    const adapter = new GoogleCalendarAdapter(api, {
      nowEpochSeconds: () => 1_700_000_000,
    });

    await adapter.createEvent(input, credentials);

    expect(insertEvent).toHaveBeenCalledWith(
      "access-token",
      expect.objectContaining({
        event: expect.objectContaining({
          start: { date: "2026-08-14" },
          end: { date: "2026-08-17" },
        }),
      }),
    );
  });
});
