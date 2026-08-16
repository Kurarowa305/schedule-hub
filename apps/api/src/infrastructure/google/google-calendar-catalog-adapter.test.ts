import { describe, expect, it, vi } from "vitest";
import { CalendarCatalogProviderError } from "../../application/ports/calendar-catalog-provider.js";
import { GoogleCalendarApiError } from "./google-calendar-adapter.js";
import {
  GoogleCalendarCatalogAdapter,
  type GoogleCalendarCatalogApi,
} from "./google-calendar-catalog-adapter.js";

const credentials = {
  accessToken: "old-access",
  refreshToken: "refresh",
  accessTokenExpiresAt: 1_800_000_030,
};

describe("Google Calendar Catalog Adapter", () => {
  it("期限接近Tokenを更新し、全pageをCalendar一覧へ変換する", async () => {
    const api: GoogleCalendarCatalogApi = {
      refreshAccessToken: vi.fn(async () => ({
        accessToken: "new-access",
        accessTokenExpiresAt: 1_800_003_600,
      })),
      listCalendarPage: vi
        .fn<GoogleCalendarCatalogApi["listCalendarPage"]>()
        .mockResolvedValueOnce({
          calendars: [
            { id: "work@example.com", summary: "仕事", accessRole: "owner" },
          ],
          nextPageToken: "page-2",
        })
        .mockResolvedValueOnce({
          calendars: [
            { id: "read@example.com", summary: "閲覧", accessRole: "reader" },
          ],
          nextPageToken: null,
        }),
    };
    const adapter = new GoogleCalendarCatalogAdapter(api, {
      nowEpochSeconds: () => 1_800_000_000,
    });

    await expect(adapter.listCalendars(credentials)).resolves.toEqual({
      calendars: [
        {
          externalCalendarId: "work@example.com",
          name: "仕事",
          accessRole: "owner",
        },
        {
          externalCalendarId: "read@example.com",
          name: "閲覧",
          accessRole: "reader",
        },
      ],
      credentialUpdate: {
        accessToken: "new-access",
        accessTokenExpiresAt: 1_800_003_600,
      },
    });
    expect(api.listCalendarPage).toHaveBeenNthCalledWith(
      1,
      "new-access",
      undefined,
    );
    expect(api.listCalendarPage).toHaveBeenNthCalledWith(
      2,
      "new-access",
      "page-2",
    );
  });

  it("Google AUTHエラーを認証失効へ正規化する", async () => {
    const api: GoogleCalendarCatalogApi = {
      refreshAccessToken: vi.fn(async () => {
        throw new GoogleCalendarApiError("AUTH", "expired");
      }),
      listCalendarPage: vi.fn(),
    };
    const adapter = new GoogleCalendarCatalogAdapter(api, {
      nowEpochSeconds: () => 1_800_000_000,
    });

    await expect(adapter.listCalendars(credentials)).rejects.toEqual(
      expect.objectContaining<Partial<CalendarCatalogProviderError>>({
        name: "CalendarCatalogProviderError",
        kind: "AUTH",
      }),
    );
  });
});
