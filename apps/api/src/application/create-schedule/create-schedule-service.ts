import {
  createCreateOperation,
  createOperationPayloadHash,
  DomainValidationError,
  type CalendarProvider,
  type LogicalDestination,
  type PhysicalCalendar,
  type UserPreference,
} from "@schedule-hub/shared";
import type { CalendarProviderAdapter } from "../ports/calendar-provider.js";
import { CalendarProviderError } from "../errors/calendar-provider-error.js";
import type {
  CalendarConnection,
  CreateScheduleStore,
  StoredCalendarExecutionResult,
} from "../ports/create-schedule-store.js";
import { CreateScheduleError } from "../errors/create-schedule-error.js";
import type {
  CreateScheduleDestinationResult,
  CreateScheduleInput,
  CreateScheduleResult,
} from "./create-schedule-contract.js";

export interface CreateScheduleServiceOptions {
  readonly now?: () => Date;
  readonly leaseDurationSeconds?: number;
  readonly maxConcurrency?: number;
}

export class CreateScheduleService {
  readonly #now: () => Date;
  readonly #leaseDurationSeconds: number;
  readonly #maxConcurrency: number;

  public constructor(
    private readonly store: CreateScheduleStore,
    private readonly providers: Readonly<
      Record<CalendarProvider, CalendarProviderAdapter>
    >,
    options: CreateScheduleServiceOptions = {},
  ) {
    this.#now = options.now ?? (() => new Date());
    this.#leaseDurationSeconds = options.leaseDurationSeconds ?? 120;
    this.#maxConcurrency = Math.max(
      1,
      Math.min(options.maxConcurrency ?? 20, 20),
    );
  }

  public async execute(request: {
    readonly userId: string;
    readonly input: CreateScheduleInput;
  }): Promise<CreateScheduleResult> {
    const preference = await this.requirePreference(request.userId);
    const completed = completeEnd(request.input, preference);
    const completedEnd = completed.end;
    const payloadHash = await createOperationPayloadHash({
      userId: request.userId,
      title: request.input.title,
      start: request.input.start,
      end: completedEnd,
      destinationIds: request.input.destinationIds,
    });
    const operation = createOperation({
      operationId: request.input.operationId,
      userId: request.userId,
      title: request.input.title,
      scheduleType: request.input.scheduleType,
      start: request.input.start,
      end: completedEnd,
      timezone: preference.timezone,
      destinationIds: request.input.destinationIds,
      status: "PROCESSING",
      eventHash: payloadHash,
    });
    const destinations = await this.requireDestinations(
      request.userId,
      operation.destinationIds,
    );
    const physicalCalendarIds = [
      ...new Set(
        destinations.flatMap(({ physicalCalendarIds }) => physicalCalendarIds),
      ),
    ];
    const calendars = await this.requireWritableCalendars(
      request.userId,
      physicalCalendarIds,
    );
    const connections = await this.requireConnections(
      request.userId,
      calendars,
    );
    const now = this.#now();
    const begin = await this.store.beginCreateSchedule({
      operationId: operation.operationId,
      userId: operation.userId,
      payloadHash,
      physicalCalendarIds: calendars.map(
        ({ physicalCalendarId }) => physicalCalendarId,
      ),
      createdAt: now.toISOString(),
      leaseExpiresAt: new Date(
        now.getTime() + this.#leaseDurationSeconds * 1_000,
      ).toISOString(),
    });
    if (begin.kind === "REPLAY") {
      return { ...begin.result, replayed: true };
    }
    if (begin.kind === "CONFLICT") {
      throw new CreateScheduleError(
        "OPERATION_ID_CONFLICT",
        "operationIdは異なる予定に再利用できません",
      );
    }
    if (begin.kind === "IN_PROGRESS") {
      throw new CreateScheduleError(
        "OPERATION_IN_PROGRESS",
        "同じ予定の作成処理が進行中です",
      );
    }

    const targets = calendars.filter(({ physicalCalendarId }) =>
      begin.physicalCalendarIds.includes(physicalCalendarId),
    );
    const executionResults = await mapWithConcurrency(
      targets,
      this.#maxConcurrency,
      (calendar) =>
        this.createCalendarEvent(
          request.userId,
          request.input,
          operation.end,
          preference,
          calendar,
          requireConnection(connections, calendar.connectionId),
        ),
    );
    await Promise.all(
      executionResults.map((result) =>
        this.store.saveCalendarExecutionResult(result),
      ),
    );

    const result = aggregateResult({
      input: request.input,
      end: operation.end,
      timezone: operation.timezone,
      destinations,
      executionResults: [...begin.existingResults, ...executionResults],
      endDefaulted: completed.defaulted,
    });
    await this.store.completeCreateSchedule(result);
    return result;
  }

  private async requirePreference(userId: string): Promise<UserPreference> {
    const preference = await this.store.getUserPreference(userId);
    if (preference === null) {
      throw new CreateScheduleError(
        "INVALID_DESTINATION",
        "ユーザー設定が見つかりません",
      );
    }
    return preference;
  }

  private async requireDestinations(
    userId: string,
    destinationIds: readonly string[],
  ): Promise<readonly LogicalDestination[]> {
    const destinations = await this.store.getLogicalDestinations(
      userId,
      destinationIds,
    );
    const byId = new Map(
      destinations.map((destination) => [
        destination.destinationId,
        destination,
      ]),
    );
    for (const destinationId of destinationIds) {
      const destination = byId.get(destinationId);
      if (destination === undefined) {
        throw new CreateScheduleError(
          "INVALID_DESTINATION",
          "選択された登録先が見つかりません",
        );
      }
      if (!destination.enabled) {
        throw new CreateScheduleError(
          "DESTINATION_DISABLED",
          "選択された登録先は無効です",
        );
      }
    }
    return destinationIds.map((destinationId) => byId.get(destinationId)!);
  }

  private async requireWritableCalendars(
    userId: string,
    physicalCalendarIds: readonly string[],
  ): Promise<readonly PhysicalCalendar[]> {
    const calendars = await this.store.getPhysicalCalendars(
      userId,
      physicalCalendarIds,
    );
    const byId = new Map(
      calendars.map((calendar) => [calendar.physicalCalendarId, calendar]),
    );
    const writable = physicalCalendarIds.map((physicalCalendarId) =>
      byId.get(physicalCalendarId),
    );
    if (
      writable.some(
        (calendar) =>
          calendar === undefined ||
          !calendar.writable ||
          calendar.status !== "ACTIVE",
      )
    ) {
      throw new CreateScheduleError(
        "NO_WRITABLE_CALENDAR",
        "書き込み可能なカレンダーがありません",
      );
    }
    return writable as readonly PhysicalCalendar[];
  }

  private async requireConnections(
    userId: string,
    calendars: readonly PhysicalCalendar[],
  ): Promise<readonly CalendarConnection[]> {
    const connectionIds = [
      ...new Set(calendars.map(({ connectionId }) => connectionId)),
    ];
    return this.store.getCalendarConnections(userId, connectionIds);
  }

  private async createCalendarEvent(
    userId: string,
    input: CreateScheduleInput,
    end: string,
    preference: UserPreference,
    calendar: PhysicalCalendar,
    connection: CalendarConnection,
  ): Promise<StoredCalendarExecutionResult> {
    try {
      const created = await this.providers[calendar.provider].createEvent(
        {
          operationId: input.operationId,
          userId,
          physicalCalendarId: calendar.physicalCalendarId,
          externalCalendarId: calendar.externalCalendarId,
          title: input.title,
          ...(input.location == null ? {} : { location: input.location }),
          ...(input.description == null
            ? {}
            : { description: input.description }),
          scheduleType: input.scheduleType,
          start: input.start,
          end,
          timezone: preference.timezone,
          eventColorId:
            calendar.eventColorId ?? preference.defaultEventColorId ?? null,
          ...(preference.defaultVisibility === undefined
            ? {}
            : { visibility: preference.defaultVisibility }),
          ...(preference.defaultReminderMinutes === undefined
            ? {}
            : {
                reminders: {
                  useDefault: false,
                  overrides: preference.defaultReminderMinutes.map(
                    (minutes) => ({
                      method: "popup" as const,
                      minutes,
                    }),
                  ),
                },
              }),
        },
        connection.credentials,
      );
      if (created.credentialUpdate !== null) {
        await this.store.updateCalendarConnectionCredentials(
          userId,
          connection.connectionId,
          created.credentialUpdate,
        );
      }
      return {
        operationId: input.operationId,
        physicalCalendarId: calendar.physicalCalendarId,
        provider: calendar.provider,
        status: "SUCCESS",
        externalEventId: created.externalEventId,
        errorCode: null,
      };
    } catch (error: unknown) {
      const errorCode =
        error instanceof CalendarProviderError && error.code === "AUTH_EXPIRED"
          ? "PROVIDER_AUTH_EXPIRED"
          : "PROVIDER_API_ERROR";
      if (errorCode === "PROVIDER_AUTH_EXPIRED") {
        await this.store.markCalendarConnectionReauthRequired(
          userId,
          connection.connectionId,
        );
      }
      return {
        operationId: input.operationId,
        physicalCalendarId: calendar.physicalCalendarId,
        provider: calendar.provider,
        status: "FAILED",
        externalEventId: null,
        errorCode,
      };
    }
  }
}

function createOperation(
  input: Parameters<typeof createCreateOperation>[0],
): ReturnType<typeof createCreateOperation> {
  try {
    return createCreateOperation(input);
  } catch (error: unknown) {
    if (
      error instanceof DomainValidationError &&
      error.code === "INVALID_EVENT_PERIOD"
    ) {
      throw new CreateScheduleError("INVALID_DATETIME", error.message, {
        cause: error,
      });
    }
    throw error;
  }
}
async function mapWithConcurrency<T, R>(
  values: readonly T[],
  limit: number,
  operation: (value: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < values.length; index += limit) {
    results.push(
      ...(await Promise.all(values.slice(index, index + limit).map(operation))),
    );
  }
  return results;
}

function completeEnd(
  input: CreateScheduleInput,
  preference: UserPreference,
): { readonly end: string; readonly defaulted: boolean } {
  if (input.end !== null) {
    return { end: input.end, defaulted: false };
  }
  if (input.scheduleType === "ALL_DAY") {
    return { end: input.start, defaulted: true };
  }
  const start = Date.parse(input.start);
  if (!Number.isFinite(start)) {
    throw new CreateScheduleError("INVALID_DATETIME", "開始日時が不正です");
  }
  return {
    end: formatRfc3339(
      new Date(start + preference.defaultDurationMinutes * 60_000),
      preference.timezone,
    ),
    defaulted: true,
  };
}

function formatRfc3339(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const zone = value("timeZoneName");
  const offset = zone === "GMT" ? "Z" : zone.replace("GMT", "");
  return `${value("year")}-${value("month")}-${value("day")}T${value(
    "hour",
  )}:${value("minute")}:${value("second")}${offset}`;
}

function requireConnection(
  connections: readonly CalendarConnection[],
  connectionId: string,
): CalendarConnection {
  const connection = connections.find(
    (item) => item.connectionId === connectionId,
  );
  if (connection === undefined || connection.status !== "ACTIVE") {
    throw new CreateScheduleError(
      "PROVIDER_AUTH_EXPIRED",
      "Calendar Providerへの再接続が必要です",
    );
  }
  return connection;
}

function aggregateResult(input: {
  readonly input: CreateScheduleInput;
  readonly end: string;
  readonly timezone: string;
  readonly destinations: readonly LogicalDestination[];
  readonly executionResults: readonly StoredCalendarExecutionResult[];
  readonly endDefaulted: boolean;
}): CreateScheduleResult {
  const destinations: CreateScheduleDestinationResult[] =
    input.destinations.map((destination) => {
      const calendarResults = input.executionResults.filter(
        ({ physicalCalendarId }) =>
          destination.physicalCalendarIds.includes(physicalCalendarId),
      );
      const successCount = calendarResults.filter(
        ({ status }) => status === "SUCCESS",
      ).length;
      const status =
        successCount === calendarResults.length
          ? "CREATED"
          : successCount === 0
            ? "FAILED"
            : "PARTIAL_SUCCESS";
      const hasAuthExpired = calendarResults.some(
        ({ errorCode }) => errorCode === "PROVIDER_AUTH_EXPIRED",
      );
      return {
        id: destination.destinationId,
        name: destination.name,
        status,
        errorCode:
          status === "CREATED"
            ? null
            : hasAuthExpired
              ? "PROVIDER_AUTH_EXPIRED"
              : "PROVIDER_API_ERROR",
      };
    });
  const successCount = input.executionResults.filter(
    ({ status }) => status === "SUCCESS",
  ).length;
  const status =
    successCount === input.executionResults.length
      ? "SUCCESS"
      : successCount === 0
        ? "FAILED"
        : "PARTIAL_SUCCESS";
  const warnings = destinations
    .filter(({ status }) => status !== "CREATED")
    .map(({ name, status, errorCode }) => ({
      code: errorCode ?? "PROVIDER_API_ERROR",
      message:
        status === "PARTIAL_SUCCESS"
          ? `${name}の一部で予定を作成できませんでした。`
          : `${name}で予定を作成できませんでした。`,
    }));
  return {
    operationId: input.input.operationId,
    status,
    replayed: false,
    schedule: {
      title: input.input.title,
      scheduleType: input.input.scheduleType,
      start: input.input.start,
      end: input.end,
      timezone: input.timezone,
    },
    appliedDefaults: input.endDefaulted ? ["end"] : [],
    destinations,
    warnings,
  };
}
