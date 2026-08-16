import { describe, expect, it, vi } from "vitest";
import type {
  GoogleCalendarApiErrorKind,
  GoogleEventInsertRequest,
} from "./google-calendar-adapter.js";
import { GoogleCalendarHttpApi } from "./google-calendar-http-api.js";

const request: GoogleEventInsertRequest = {
  calendarId: "work@example.com",
  event: {
    id: "0123456789abcdefghijklmnopqrstuv0123456789abcdefghijklmn",
    summary: "定例会議",
    start: { dateTime: "2026-08-17T10:00:00+09:00" },
    end: { dateTime: "2026-08-17T11:00:00+09:00" },
  },
};

describe("GoogleCalendarHttpApiのエラー正規化", () => {
  it.each<[number, GoogleCalendarApiErrorKind]>([
    [400, "PERMANENT"],
    [401, "AUTH"],
    [409, "DUPLICATE"],
    [429, "RATE_LIMIT"],
    [500, "SERVER"],
    [503, "SERVER"],
  ])("HTTP %iを%sへ変換する", async (status, kind) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      new Response(JSON.stringify({ error: { code: status } }), { status }),
    );
    const api = new GoogleCalendarHttpApi({
      clientId: "client-id",
      clientSecret: "client-secret",
      fetch,
    });

    await expect(api.insertEvent("access-token", request)).rejects.toMatchObject(
      { name: "GoogleCalendarApiError", kind },
    );
  });

  it.each<[string, GoogleCalendarApiErrorKind]>([
    ["TimeoutError", "TIMEOUT"],
    ["TypeError", "NETWORK"],
  ])("%sを%sへ変換する", async (name, kind) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      throw Object.assign(new Error("request failed"), { name });
    });
    const api = new GoogleCalendarHttpApi({
      clientId: "client-id",
      clientSecret: "client-secret",
      fetch,
    });

    await expect(api.insertEvent("access-token", request)).rejects.toMatchObject(
      { name: "GoogleCalendarApiError", kind },
    );
  });
});
