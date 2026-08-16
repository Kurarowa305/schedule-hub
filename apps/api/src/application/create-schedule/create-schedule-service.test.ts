import {
  createLogicalDestination,
  createPhysicalCalendar,
  createUserPreference,
} from "@schedule-hub/shared";
import { describe, expect, it, vi } from "vitest";
import type { CalendarProviderAdapter } from "../ports/calendar-provider.js";
import type {
  CalendarConnection,
  CreateScheduleStore,
} from "../ports/create-schedule-store.js";
import { CreateScheduleService } from "./create-schedule-service.js";

describe("CreateScheduleService", () => {
  it("認証ユーザーの1 Destinationへ予定を1件作成して履歴を保存する", async () => {
    const preference = createUserPreference({
      timezone: "Asia/Tokyo",
      defaultDurationMinutes: 60,
      defaultDestinationIds: ["work"],
    });
    const destination = createLogicalDestination({
      destinationId: "work",
      name: "仕事",
      aliases: ["業務"],
      description: "仕事の予定",
      physicalCalendarIds: ["pcal-work"],
      enabled: true,
    });
    const calendar = createPhysicalCalendar({
      physicalCalendarId: "pcal-work",
      provider: "GOOGLE",
      connectionId: "conn-google",
      externalCalendarId: "work@example.com",
      name: "仕事",
      accessRole: "owner",
      writable: true,
      status: "ACTIVE",
      eventColorId: "5",
    });
    const connection: CalendarConnection = {
      connectionId: "conn-google",
      provider: "GOOGLE",
      status: "ACTIVE",
      credentials: {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        accessTokenExpiresAt: 1_800_000_000,
      },
    };
    const store: CreateScheduleStore = {
      getUserPreference: vi.fn(async () => preference),
      getLogicalDestinations: vi.fn(async () => [destination]),
      getPhysicalCalendars: vi.fn(async () => [calendar]),
      getCalendarConnections: vi.fn(async () => [connection]),
      beginCreateSchedule: vi.fn(async (command) => ({
        kind: "EXECUTE" as const,
        physicalCalendarIds: command.physicalCalendarIds,
        existingResults: [],
      })),
      saveCalendarExecutionResult: vi.fn(async () => undefined),
      updateCalendarConnectionCredentials: vi.fn(async () => undefined),
      markCalendarConnectionReauthRequired: vi.fn(async () => undefined),
      completeCreateSchedule: vi.fn(async () => undefined),
    };
    const provider: CalendarProviderAdapter = {
      createEvent: vi.fn(async () => ({
        externalEventId: "google-event-id",
        credentialUpdate: null,
      })),
    };
    const service = new CreateScheduleService(store, { GOOGLE: provider }, {
      now: () => new Date("2026-08-16T00:00:00.000Z"),
    });

    const result = await service.execute({
      userId: "user-1",
      input: {
        operationId: "op_01J5AR7Y5N3K8M2P6Q9T4VWXZB",
        title: "顧客との定例",
        scheduleType: "TIMED",
        start: "2026-08-17T10:00:00+09:00",
        end: "2026-08-17T11:00:00+09:00",
        destinationIds: ["work"],
        location: "会議室A",
        description: "週次の打ち合わせ",
        destinationInference: {
          type: "EXPLICIT",
          reason: "ユーザーが仕事と明示したため",
        },
      },
    });

    expect(result).toEqual({
      operationId: "op_01J5AR7Y5N3K8M2P6Q9T4VWXZB",
      status: "SUCCESS",
      replayed: false,
      schedule: {
        title: "顧客との定例",
        scheduleType: "TIMED",
        start: "2026-08-17T10:00:00+09:00",
        end: "2026-08-17T11:00:00+09:00",
        timezone: "Asia/Tokyo",
      },
      appliedDefaults: [],
      destinations: [
        {
          id: "work",
          name: "仕事",
          status: "CREATED",
          errorCode: null,
        },
      ],
      warnings: [],
    });
    expect(provider.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: result.operationId,
        userId: "user-1",
        physicalCalendarId: "pcal-work",
        externalCalendarId: "work@example.com",
        eventColorId: "5",
        location: "会議室A",
        timezone: "Asia/Tokyo",
      }),
      connection.credentials,
    );
    expect(store.saveCalendarExecutionResult).toHaveBeenCalledWith({
      operationId: result.operationId,
      physicalCalendarId: "pcal-work",
      provider: "GOOGLE",
      status: "SUCCESS",
      externalEventId: "google-event-id",
      errorCode: null,
    });
    expect(store.completeCreateSchedule).toHaveBeenCalledWith(result);
    expect(JSON.stringify(result)).not.toContain("pcal-work");
    expect(JSON.stringify(result)).not.toContain("work@example.com");
  });
});
