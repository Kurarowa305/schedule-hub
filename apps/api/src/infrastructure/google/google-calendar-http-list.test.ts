import { describe, expect, it, vi } from "vitest";
import { GoogleCalendarHttpApi } from "./google-calendar-http-api.js";

describe("Google CalendarList HTTP", () => {
  it("pageToken付きでCalendarList.listを呼び出す", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        items: [
          { id: "work@example.com", summary: "仕事", accessRole: "writer" },
        ],
        nextPageToken: "next-page",
      }),
    );
    const api = new GoogleCalendarHttpApi({
      clientId: "client",
      clientSecret: "secret",
      fetch,
    });

    await expect(api.listCalendarPage("access", "page-1")).resolves.toEqual({
      calendars: [
        { id: "work@example.com", summary: "仕事", accessRole: "writer" },
      ],
      nextPageToken: "next-page",
    });
    const [input, init] = fetch.mock.calls[0] ?? [];
    expect(String(input)).toBe(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?pageToken=page-1",
    );
    expect(init).toMatchObject({
      method: "GET",
      headers: { authorization: "Bearer access" },
    });
  });

  it.each([
    ["HTTP 401", new Response("unauthorized", { status: 401 }), "AUTH"],
    [
      "不正なaccessRole",
      Response.json({
        items: [{ id: "id", summary: "name", accessRole: "unknown" }],
      }),
      "PERMANENT",
    ],
  ])("%sをGoogle APIエラーへ変換する", async (_name, response, kind) => {
    const api = new GoogleCalendarHttpApi({
      clientId: "client",
      clientSecret: "secret",
      fetch: vi.fn(async () => response),
    });

    await expect(api.listCalendarPage("access")).rejects.toMatchObject({
      kind,
    });
  });
});
