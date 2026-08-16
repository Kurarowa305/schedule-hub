import { randomUUID } from "node:crypto";
import {
  createLogicalDestination,
  createUserPreference,
  type LogicalDestination,
  type PhysicalCalendar,
  type UserPreference,
} from "@schedule-hub/shared";
import type {
  Page,
  StoredCalendarConnection,
} from "../application/ports/schedule-hub-repository.js";
import {
  WebRestApiError,
  type WebRestApiExecutionRequest,
  type WebRestApiExecutor,
} from "../presentation/rest/web-rest-api-endpoint.js";

export interface ExternalDisplayTargetRecord {
  readonly target: "TIMETREE" | "YAHOO";
  readonly enabled: boolean;
  readonly physicalCalendarId: string | null;
  readonly setupConfirmed: boolean;
}

export interface OperationSummary {
  readonly operationId: string;
  readonly userId: string;
  readonly title: string;
  readonly start: string;
  readonly end: string;
  readonly destinationIds: readonly string[];
  readonly status: "PROCESSING" | "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";
  readonly createdAt: string;
}

export interface OperationDetail extends Omit<OperationSummary, "userId"> {
  readonly timezone: string;
  readonly events: readonly {
    readonly physicalCalendarId: string;
    readonly status: "SUCCESS" | "FAILED";
    readonly errorCode: string | null;
  }[];
}

export interface WebApplicationStore {
  getUserPreference(userId: string): Promise<UserPreference | null>;
  putUserPreference(userId: string, preference: UserPreference): Promise<void>;
  listConnections(userId: string): Promise<readonly StoredCalendarConnection[]>;
  disconnectConnection(userId: string, connectionId: string): Promise<void>;
  listPhysicalCalendars(userId: string): Promise<readonly PhysicalCalendar[]>;
  putPhysicalCalendar(
    userId: string,
    calendar: PhysicalCalendar,
  ): Promise<void>;
  listLogicalDestinations(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<Page<LogicalDestination>>;
  getLogicalDestination(
    userId: string,
    destinationId: string,
  ): Promise<LogicalDestination | null>;
  putLogicalDestination(
    userId: string,
    destination: LogicalDestination,
  ): Promise<void>;
  listDisplayTargets(
    userId: string,
  ): Promise<readonly ExternalDisplayTargetRecord[]>;
  putDisplayTarget(
    userId: string,
    target: ExternalDisplayTargetRecord,
  ): Promise<void>;
  listOperations(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<Page<OperationSummary>>;
  getOperationDetail(
    userId: string,
    operationId: string,
  ): Promise<OperationDetail | null>;
}

export interface WebRestExecutorOptions {
  readonly store: WebApplicationStore;
  readonly generateDestinationId?: () => string;
}

export function createWebRestExecutor(
  options: WebRestExecutorOptions,
): WebRestApiExecutor {
  const generateDestinationId =
    options.generateDestinationId ??
    (() => `dest_${randomUUID().replaceAll("-", "")}`);
  return {
    async execute(request) {
      const userId = requireUserId(request);
      switch (request.operation) {
        case "GET_ME": {
          const storedPreference =
            await options.store.getUserPreference(userId);
          const preference =
            storedPreference ??
            createUserPreference({
              timezone: "Asia/Tokyo",
              defaultDurationMinutes: 60,
              defaultDestinationIds: [],
            });
          if (storedPreference === null) {
            await options.store.putUserPreference(userId, preference);
          }
          return { kind: "data", data: { userId, ...preference } };
        }
        case "UPDATE_PREFERENCES": {
          const current =
            (await options.store.getUserPreference(userId)) ??
            createUserPreference({
              timezone: "Asia/Tokyo",
              defaultDurationMinutes: 60,
              defaultDestinationIds: [],
            });
          const body = requireBody(request);
          const preference = createUserPreference({
            timezone: stringValue(body.timezone, current.timezone),
            defaultDurationMinutes: numberValue(
              body.defaultDurationMinutes,
              current.defaultDurationMinutes,
            ),
            defaultDestinationIds: stringArrayValue(
              body.defaultDestinationIds,
              current.defaultDestinationIds,
            ),
            defaultReminderMinutes: numberArrayValue(
              body.defaultReminderMinutes,
              current.defaultReminderMinutes ?? [],
            ),
            defaultEventColorId:
              body.defaultEventColorId === undefined
                ? (current.defaultEventColorId ?? null)
                : nullableString(body.defaultEventColorId),
            defaultVisibility: visibilityValue(
              body.defaultVisibility,
              current.defaultVisibility ?? "default",
            ),
          });
          await options.store.putUserPreference(userId, preference);
          return { kind: "data", data: preference };
        }
        case "LIST_CONNECTIONS": {
          const connections = await options.store.listConnections(userId);
          return {
            kind: "data",
            data: connections.map(
              ({
                connectionId,
                provider,
                accountIdentifier,
                status,
                createdAt,
              }) => ({
                connectionId,
                provider,
                accountIdentifier,
                status,
                createdAt,
              }),
            ),
          };
        }
        case "DISCONNECT_CALENDAR":
          await options.store.disconnectConnection(
            userId,
            requiredPath(request, "connectionId"),
          );
          return { kind: "data", data: { disconnected: true } };
        case "LIST_PHYSICAL_CALENDARS": {
          const calendars = await options.store.listPhysicalCalendars(userId);
          const filtered = calendars.filter(
            (calendar) =>
              (request.query.connectionId === undefined ||
                calendar.connectionId === request.query.connectionId) &&
              (request.query.writableOnly !== "true" || calendar.writable),
          );
          return {
            kind: "data",
            data: filtered.map((calendar) => ({
              physicalCalendarId: calendar.physicalCalendarId,
              provider: calendar.provider,
              connectionId: calendar.connectionId,
              name: calendar.name,
              accessRole: calendar.accessRole,
              writable: calendar.writable,
              eventColorId: calendar.eventColorId,
            })),
          };
        }
        case "UPDATE_PHYSICAL_CALENDAR": {
          const calendarId = requiredPath(request, "physicalCalendarId");
          const calendar = (
            await options.store.listPhysicalCalendars(userId)
          ).find(({ physicalCalendarId }) => physicalCalendarId === calendarId);
          if (calendar === undefined) notFound("Physical Calendar");
          const body = requireBody(request);
          const eventColorId = body.eventColorId;
          if (eventColorId !== null && typeof eventColorId !== "string")
            invalid();
          await options.store.putPhysicalCalendar(userId, {
            ...calendar,
            eventColorId,
          });
          return {
            kind: "data",
            data: { physicalCalendarId: calendarId, eventColorId },
          };
        }
        case "LIST_DESTINATIONS": {
          const page = await options.store.listLogicalDestinations(
            userId,
            pageLimit(request.query.limit),
            request.query.cursor,
          );
          return {
            kind: "page",
            data: page.items,
            nextCursor: page.nextCursor,
          };
        }
        case "CREATE_DESTINATION": {
          const destination = await destinationFromBody(
            options.store,
            userId,
            generateDestinationId(),
            requireBody(request),
          );
          await options.store.putLogicalDestination(userId, destination);
          return {
            kind: "data",
            data: { destinationId: destination.destinationId },
            status: 201,
          };
        }
        case "UPDATE_DESTINATION": {
          const destinationId = requiredPath(request, "destinationId");
          const current = await options.store.getLogicalDestination(
            userId,
            destinationId,
          );
          if (current === null) notFound("Logical Destination");
          const body = requireBody(request);
          const destination = await destinationFromBody(
            options.store,
            userId,
            destinationId,
            {
              name: body.name ?? current.name,
              aliases: body.aliases ?? current.aliases,
              description: body.description ?? current.description,
              physicalCalendarIds:
                body.physicalCalendarIds ?? current.physicalCalendarIds,
              enabled: body.enabled ?? current.enabled,
            },
          );
          await options.store.putLogicalDestination(userId, destination);
          return { kind: "data", data: destination };
        }
        case "LIST_DISPLAY_TARGETS":
          return {
            kind: "data",
            data: await options.store.listDisplayTargets(userId),
          };
        case "PUT_DISPLAY_TARGET": {
          const target = requiredPath(request, "target");
          if (target !== "TIMETREE" && target !== "YAHOO") invalid();
          const body = requireBody(request);
          const record: ExternalDisplayTargetRecord = {
            target,
            enabled: booleanValue(body.enabled),
            physicalCalendarId: nullableString(body.physicalCalendarId),
            setupConfirmed: booleanValue(body.setupConfirmed),
          };
          await options.store.putDisplayTarget(userId, record);
          return { kind: "data", data: record };
        }
        case "LIST_OPERATIONS": {
          const page = await options.store.listOperations(
            userId,
            pageLimit(request.query.limit),
            request.query.cursor,
          );
          return {
            kind: "page",
            data: page.items.map((operation) => ({
              operationId: operation.operationId,
              title: operation.title,
              start: operation.start,
              end: operation.end,
              destinationIds: operation.destinationIds,
              status: operation.status,
              createdAt: operation.createdAt,
            })),
            nextCursor: page.nextCursor,
          };
        }
        case "GET_OPERATION": {
          const detail = await options.store.getOperationDetail(
            userId,
            requiredPath(request, "operationId"),
          );
          if (detail === null) notFound("Create Operation");
          return { kind: "data", data: detail };
        }
        case "START_OAUTH":
        case "OAUTH_CALLBACK":
        case "SYNC_CALENDARS":
          throw new WebRestApiError(
            "INTERNAL_ERROR",
            "Calendar OAuth Lambdaへrouteされていません",
            500,
          );
      }
    },
  };
}

async function destinationFromBody(
  store: WebApplicationStore,
  userId: string,
  destinationId: string,
  body: Readonly<Record<string, unknown>>,
): Promise<LogicalDestination> {
  const physicalCalendarIds = stringArrayValue(body.physicalCalendarIds);
  const calendars = await store.listPhysicalCalendars(userId);
  const available = new Map(
    calendars.map((calendar) => [calendar.physicalCalendarId, calendar]),
  );
  if (
    physicalCalendarIds.length === 0 ||
    physicalCalendarIds.some((id) => {
      const calendar = available.get(id);
      return (
        calendar === undefined ||
        !calendar.writable ||
        calendar.status !== "ACTIVE"
      );
    })
  ) {
    throw new WebRestApiError(
      "INVALID_PHYSICAL_CALENDAR",
      "書き込み可能なPhysical Calendarを指定してください",
      400,
    );
  }
  try {
    return createLogicalDestination({
      destinationId,
      name: stringValue(body.name),
      aliases: stringArrayValue(body.aliases),
      description: stringValue(body.description),
      physicalCalendarIds,
      enabled: body.enabled === undefined ? true : booleanValue(body.enabled),
    });
  } catch (cause: unknown) {
    throw new WebRestApiError(
      "INVALID_DESTINATION",
      "登録先の入力が不正です",
      400,
      {
        cause: cause instanceof Error ? cause.message : "unknown",
      },
    );
  }
}

function requireUserId(request: WebRestApiExecutionRequest): string {
  if (request.userId === null)
    throw new WebRestApiError("UNAUTHORIZED", "認証が必要です", 401);
  return request.userId;
}

function requireBody(
  request: WebRestApiExecutionRequest,
): Readonly<Record<string, unknown>> {
  if (request.body === null) invalid();
  return request.body;
}

function requiredPath(
  request: WebRestApiExecutionRequest,
  name: string,
): string {
  const value = request.pathParameters[name];
  if (!value) invalid();
  return value;
}

function pageLimit(value: string | undefined): number {
  if (value === undefined) return 20;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) invalid();
  return limit;
}

function stringValue(value: unknown, fallback?: string): string {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string") invalid();
  return value;
}

function numberValue(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number") invalid();
  return value;
}

function stringArrayValue(
  value: unknown,
  fallback?: readonly string[],
): readonly string[] {
  if (value === undefined && fallback !== undefined) return fallback;
  if (
    !Array.isArray(value) ||
    !value.every((entry) => typeof entry === "string")
  )
    invalid();
  return value as string[];
}

function numberArrayValue(
  value: unknown,
  fallback: readonly number[],
): readonly number[] {
  if (value === undefined) return fallback;
  if (
    !Array.isArray(value) ||
    !value.every((entry) => typeof entry === "number")
  )
    invalid();
  return value as number[];
}

function visibilityValue(
  value: unknown,
  fallback: "default" | "public" | "private" | "confidential",
): "default" | "public" | "private" | "confidential" {
  if (value === undefined) return fallback;
  if (
    value !== "default" &&
    value !== "public" &&
    value !== "private" &&
    value !== "confidential"
  )
    invalid();
  return value;
}

function booleanValue(value: unknown): boolean {
  if (typeof value !== "boolean") invalid();
  return value;
}

function nullableString(value: unknown): string | null {
  if (value !== null && typeof value !== "string") invalid();
  return value as string | null;
}

function invalid(): never {
  throw new WebRestApiError("INVALID_REQUEST", "Requestが不正です", 400);
}

function notFound(name: string): never {
  throw new WebRestApiError("NOT_FOUND", `${name}が見つかりません`, 404);
}
