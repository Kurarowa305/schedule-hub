import { describe, expect, it, vi } from "vitest";
import type { GoogleEventInsertRequest } from "./google-calendar-adapter.js";
import { GoogleCalendarHttpApi } from "./google-calendar-http-api.js";

const request: GoogleEventInsertRequest = {
  calendarId: "work calendar@example.com",
  sendUpdates: "none",
  event: {
    id: "0123456789abcdefghijklmnopqrstuv0123456789abcdefghijklmn",
    summary: "定例会議",
    start: {
      dateTime: "2026-08-17T10:00:00+09:00",
      timeZone: "Asia/Tokyo",
    },
    end: {
      dateTime: "2026-08-17T11:00:00+09:00",
      timeZone: "Asia/Tokyo",
    },
    reminders: {
      useDefault: false,
      overrides: [{ method: "popup", minutes: 10 }],
    },
    colorId: "5",
    visibility: "private",
  },
};

describe("GoogleCalendarHttpApi", () => {
  it("Events.insertへBearer Tokenと予定Resourceを送信する", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      new Response(JSON.stringify({ id: request.event.id }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const api = new GoogleCalendarHttpApi({
      clientId: "client-id",
      clientSecret: "client-secret",
      fetch,
    });

    await expect(api.insertEvent("access-token", request)).resolves.toEqual({
      id: request.event.id,
    });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/" +
        "work%20calendar%40example.com/events?sendUpdates=none",
    );
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        authorization: "Bearer access-token",
        "content-type": "application/json",
      },
      body: JSON.stringify(request.event),
    });
  });
});
