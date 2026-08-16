import { describe, expect, it, vi } from "vitest";
import type { StoredCalendarConnection } from "../ports/schedule-hub-repository.js";
import {
  CalendarSyncService,
  type CalendarSyncStore,
  type StoredPhysicalCalendar,
} from "./calendar-sync-service.js";
import {
  CalendarCatalogProviderError,
  type CalendarCatalogProvider,
} from "../ports/calendar-catalog-provider.js";

const now = "2026-08-16T06:00:00.000Z";
const connection: StoredCalendarConnection = {
  connectionId: "conn-new",
  provider: "GOOGLE",
  accountIdentifier: "calendar-user@example.com",
  accessToken: "access",
  refreshToken: "refresh",
  accessTokenExpiresAt: 1_800_003_600,
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function existing(
  overrides: Partial<StoredPhysicalCalendar> = {},
): StoredPhysicalCalendar {
  return {
    physicalCalendarId: "pcal-existing",
    provider: "GOOGLE",
    connectionId: "conn-old",
    externalCalendarId: "work@example.com",
    name: "旧名称",
    accessRole: "writer",
    writable: true,
    status: "ACTIVE",
    eventColorId: "5",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function fixture(options?: {
  readonly connection?: StoredCalendarConnection | null;
  readonly existing?: readonly StoredPhysicalCalendar[];
}) {
  const saved: StoredPhysicalCalendar[] = [];
  const store: CalendarSyncStore = {
    getCalendarConnection: vi.fn(async () =>
      options !== undefined && "connection" in options
        ? (options.connection ?? null)
        : connection,
    ),
    listPhysicalCalendarsForAccount: vi.fn(async () => options?.existing ?? []),
    putPhysicalCalendar: vi.fn(async (_userId, calendar) => {
      saved.push(calendar);
    }),
    updateCalendarConnectionCredentials: vi.fn(async () => undefined),
    markCalendarConnectionReauthRequired: vi.fn(async () => undefined),
  };
  const provider: CalendarCatalogProvider = {
    listCalendars: vi.fn<CalendarCatalogProvider["listCalendars"]>(
      async () => ({
        calendars: [
          {
            externalCalendarId: "work@example.com",
            name: "仕事",
            accessRole: "owner",
          },
          {
            externalCalendarId: "read@example.com",
            name: "閲覧用",
            accessRole: "reader",
          },
        ],
        credentialUpdate: null,
      }),
    ),
  };
  const service = new CalendarSyncService({
    store,
    provider,
    generatePhysicalCalendarId: () => `pcal-${saved.length + 1}`,
    now: () => now,
  });
  return { service, store, provider, saved };
}

describe("Calendar同期", () => {
  it("既存IDと設定を維持して名称・Connection・権限を更新する", async () => {
    const context = fixture({ existing: [existing()] });

    await expect(
      context.service.sync({ userId: "user-1", connectionId: "conn-new" }),
    ).resolves.toEqual({ connectionId: "conn-new", syncedCount: 2 });

    expect(context.saved).toContainEqual({
      ...existing(),
      connectionId: "conn-new",
      name: "仕事",
      accessRole: "owner",
      writable: true,
      status: "ACTIVE",
      eventColorId: "5",
      updatedAt: now,
    });
  });

  it("読み取り専用Calendarを保存するが書込先から除外する", async () => {
    const { service, saved } = fixture();

    await service.sync({ userId: "user-1", connectionId: "conn-new" });

    expect(saved).toContainEqual(
      expect.objectContaining({
        externalCalendarId: "read@example.com",
        accessRole: "reader",
        writable: false,
      }),
    );
  });

  it("Providerから消えたCalendarを論理削除しMapping用IDを維持する", async () => {
    const missing = existing({ externalCalendarId: "missing@example.com" });
    const { service, saved } = fixture({ existing: [missing] });

    await service.sync({ userId: "user-1", connectionId: "conn-new" });

    expect(saved).toContainEqual({
      ...missing,
      connectionId: "conn-new",
      writable: false,
      status: "DELETED",
      updatedAt: now,
    });
  });

  it("同じアカウントの再接続では旧ConnectionのPhysicalCalendar IDを再利用する", async () => {
    const { service, saved, store } = fixture({ existing: [existing()] });

    await service.sync({ userId: "user-1", connectionId: "conn-new" });

    expect(store.listPhysicalCalendarsForAccount).toHaveBeenCalledWith(
      "user-1",
      "GOOGLE",
      "calendar-user@example.com",
    );
    expect(
      saved.find((item) => item.externalCalendarId === "work@example.com")
        ?.physicalCalendarId,
    ).toBe("pcal-existing");
  });

  it.each([
    ["所有接続なし", null, "CONNECTION_NOT_FOUND"],
    [
      "再認証が必要",
      { ...connection, status: "REAUTH_REQUIRED" as const },
      "REAUTH_REQUIRED",
    ],
  ])("%sならProviderを呼ばない", async (_name, storedConnection, code) => {
    const { service, provider } = fixture({ connection: storedConnection });

    await expect(
      service.sync({ userId: "user-1", connectionId: "conn-new" }),
    ).rejects.toMatchObject({ code });
    expect(provider.listCalendars).not.toHaveBeenCalled();
  });

  it("Provider認証失効時はConnectionをREAUTH_REQUIREDにする", async () => {
    const { service, provider, store } = fixture();
    vi.mocked(provider.listCalendars).mockRejectedValue(
      new CalendarCatalogProviderError("AUTH", "expired"),
    );

    await expect(
      service.sync({ userId: "user-1", connectionId: "conn-new" }),
    ).rejects.toMatchObject({ code: "PROVIDER_AUTH_EXPIRED" });
    expect(store.markCalendarConnectionReauthRequired).toHaveBeenCalledWith(
      "user-1",
      "conn-new",
    );
  });
});
