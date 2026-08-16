import { createPhysicalCalendar } from "@schedule-hub/shared";
import type { PhysicalCalendar } from "@schedule-hub/shared";
import type { StoredCalendarConnection } from "../application/ports/schedule-hub-repository.js";
import { describe, expect, it, vi } from "vitest";
import {
  createWebRestExecutor,
  type WebApplicationStore,
} from "./web-rest-executor.js";

describe("Web REST本番Application executor", () => {
  it("初回GET_MEで日本標準時の既定Profileを作成する", async () => {
    const store = fakeStore();
    const executor = createWebRestExecutor({ store });

    const result = await executor.execute(request("GET_ME"));

    expect(result).toEqual({
      kind: "data",
      data: {
        userId: "user-1",
        timezone: "Asia/Tokyo",
        defaultDurationMinutes: 60,
        defaultDestinationIds: [],
      },
    });
    expect(store.putUserPreference).toHaveBeenCalledOnce();
  });

  it("Calendar Connection一覧からtokenを除外する", async () => {
    const store = fakeStore({
      connections: [
        {
          connectionId: "conn-1",
          provider: "GOOGLE",
          accountIdentifier: "test@example.com",
          accessToken: "secret-access",
          refreshToken: "secret-refresh",
          accessTokenExpiresAt: 2_000_000_000,
          status: "ACTIVE",
          createdAt: "2026-08-16T00:00:00.000Z",
          updatedAt: "2026-08-16T00:00:00.000Z",
        },
      ],
    });
    const executor = createWebRestExecutor({ store });

    const result = await executor.execute(request("LIST_CONNECTIONS"));

    expect(JSON.stringify(result)).not.toContain("secret-");
    expect(result).toMatchObject({
      kind: "data",
      data: [{ connectionId: "conn-1", accountIdentifier: "test@example.com" }],
    });
  });

  it("書込み不可Calendarを指定したDestination作成を拒否する", async () => {
    const store = fakeStore({
      calendars: [
        createPhysicalCalendar({
          physicalCalendarId: "pcal-readonly",
          provider: "GOOGLE",
          connectionId: "conn-1",
          externalCalendarId: "readonly@example.com",
          name: "閲覧専用",
          accessRole: "reader",
          writable: false,
          status: "ACTIVE",
          eventColorId: null,
        }),
      ],
    });
    const executor = createWebRestExecutor({ store });

    await expect(
      executor.execute({
        ...request("CREATE_DESTINATION"),
        body: {
          name: "仕事",
          aliases: [],
          description: "仕事用",
          physicalCalendarIds: ["pcal-readonly"],
        },
      }),
    ).rejects.toMatchObject({
      code: "INVALID_PHYSICAL_CALENDAR",
      status: 400,
    });
  });
});

function request(
  operation: Parameters<
    ReturnType<typeof createWebRestExecutor>["execute"]
  >[0]["operation"],
) {
  return {
    operation,
    userId: "user-1",
    pathParameters: {},
    query: {},
    body: null,
  } as const;
}

function fakeStore(
  options: {
    readonly connections?: readonly StoredCalendarConnection[];
    readonly calendars?: readonly PhysicalCalendar[];
  } = {},
): WebApplicationStore {
  return {
    getUserPreference: vi.fn(async () => null),
    putUserPreference: vi.fn(async () => undefined),
    listConnections: vi.fn(async () => options.connections ?? []),
    disconnectConnection: vi.fn(async () => undefined),
    listPhysicalCalendars: vi.fn(async () => options.calendars ?? []),
    putPhysicalCalendar: vi.fn(async () => undefined),
    listLogicalDestinations: vi.fn(async () => ({
      items: [],
      nextCursor: null,
    })),
    getLogicalDestination: vi.fn(async () => null),
    putLogicalDestination: vi.fn(async () => undefined),
    listDisplayTargets: vi.fn(async () => []),
    putDisplayTarget: vi.fn(async () => undefined),
    listOperations: vi.fn(async () => ({ items: [], nextCursor: null })),
    getOperationDetail: vi.fn(async () => null),
  };
}
