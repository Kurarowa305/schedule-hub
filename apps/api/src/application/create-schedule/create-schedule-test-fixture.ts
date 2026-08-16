import {
  createLogicalDestination,
  createPhysicalCalendar,
  createUserPreference,
  type LogicalDestination,
  type PhysicalCalendar,
  type UserPreference,
} from "@schedule-hub/shared";
import { vi } from "vitest";
import type { CalendarProviderAdapter } from "../ports/calendar-provider.js";
import type {
  BeginCreateScheduleResult,
  CalendarConnection,
  CreateScheduleStore,
} from "../ports/create-schedule-store.js";
import type { CreateScheduleInput } from "./create-schedule-contract.js";
import { CreateScheduleService } from "./create-schedule-service.js";

export const baseInput: CreateScheduleInput = {
  operationId: "op_01J5AR7Y5N3K8M2P6Q9T4VWXZB",
  title: "顧客との定例",
  scheduleType: "TIMED",
  start: "2026-08-17T10:00:00+09:00",
  end: "2026-08-17T11:00:00+09:00",
  destinationIds: ["work"],
  destinationInference: {
    type: "EXPLICIT",
    reason: "ユーザーが仕事と明示したため",
  },
};

export interface CreateScheduleFixtureOptions {
  readonly preference?: UserPreference | null;
  readonly destinations?: readonly LogicalDestination[];
  readonly calendars?: readonly PhysicalCalendar[];
  readonly connections?: readonly CalendarConnection[];
  readonly beginResult?: BeginCreateScheduleResult;
  readonly createEvent?: CalendarProviderAdapter["createEvent"];
}

export function createScheduleFixture(
  options: CreateScheduleFixtureOptions = {},
) {
  const preference =
    options.preference === undefined
      ? createUserPreference({
          timezone: "Asia/Tokyo",
          defaultDurationMinutes: 60,
          defaultDestinationIds: ["work"],
        })
      : options.preference;
  const destinations = options.destinations ?? [destination("work", ["pcal-work"])];
  const calendars = options.calendars ?? [calendar("pcal-work", "conn-google")];
  const connections = options.connections ?? [connection("conn-google")];
  const createEvent = vi.fn<CalendarProviderAdapter["createEvent"]>(
    options.createEvent ??
      (async (input) => ({
        externalEventId: `event-${input.physicalCalendarId}`,
        credentialUpdate: null,
      })),
  );
  const store: CreateScheduleStore = {
    getUserPreference: vi.fn(async () => preference),
    getLogicalDestinations: vi.fn(async (_userId, destinationIds) =>
      destinations.filter(({ destinationId }) =>
        destinationIds.includes(destinationId),
      ),
    ),
    getPhysicalCalendars: vi.fn(async (_userId, physicalCalendarIds) =>
      calendars.filter(({ physicalCalendarId }) =>
        physicalCalendarIds.includes(physicalCalendarId),
      ),
    ),
    getCalendarConnections: vi.fn(async (_userId, connectionIds) =>
      connections.filter(({ connectionId }) =>
        connectionIds.includes(connectionId),
      ),
    ),
    beginCreateSchedule: vi.fn(async (command) =>
      options.beginResult ?? {
        kind: "EXECUTE" as const,
        physicalCalendarIds: command.physicalCalendarIds,
        existingResults: [],
      },
    ),
    saveCalendarExecutionResult: vi.fn(async () => undefined),
    updateCalendarConnectionCredentials: vi.fn(async () => undefined),
    markCalendarConnectionReauthRequired: vi.fn(async () => undefined),
    completeCreateSchedule: vi.fn(async () => undefined),
  };
  const provider: CalendarProviderAdapter = { createEvent };
  const service = new CreateScheduleService(store, { GOOGLE: provider }, {
    now: () => new Date("2026-08-16T00:00:00.000Z"),
  });
  return { service, store, provider, createEvent };
}

export function destination(
  destinationId: string,
  physicalCalendarIds: readonly string[],
  enabled = true,
): LogicalDestination {
  return createLogicalDestination({
    destinationId,
    name: `登録先${destinationId}`,
    aliases: [],
    description: `${destinationId}用`,
    physicalCalendarIds,
    enabled,
  });
}

export function calendar(
  physicalCalendarId: string,
  connectionId: string,
): PhysicalCalendar {
  return createPhysicalCalendar({
    physicalCalendarId,
    provider: "GOOGLE",
    connectionId,
    externalCalendarId: `${physicalCalendarId}@example.com`,
    name: physicalCalendarId,
    accessRole: "owner",
    writable: true,
    status: "ACTIVE",
    eventColorId: null,
  });
}

export function connection(connectionId: string): CalendarConnection {
  return {
    connectionId,
    provider: "GOOGLE",
    status: "ACTIVE",
    credentials: {
      accessToken: `access-${connectionId}`,
      refreshToken: `refresh-${connectionId}`,
      accessTokenExpiresAt: 1_800_000_000,
    },
  };
}
