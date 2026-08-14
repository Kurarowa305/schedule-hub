import type { ScheduleType } from "../index.js";
import type { CalendarProvider } from "./physical-calendar.js";
import { DomainValidationError } from "./validation-error.js";

export type CreateOperationStatus =
  "PROCESSING" | "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";

export interface CreateOperationInput {
  readonly operationId: string;
  readonly userId: string;
  readonly title: string;
  readonly scheduleType: ScheduleType;
  readonly start: string;
  readonly end: string;
  readonly timezone: string;
  readonly destinationIds: readonly string[];
  readonly status: CreateOperationStatus;
  readonly eventHash: string;
}

export type CreateOperation = CreateOperationInput;

export type ExternalEventStatus = "SUCCESS" | "FAILED";

export interface ExternalEventInput {
  readonly physicalCalendarId: string;
  readonly provider: CalendarProvider;
  readonly status: ExternalEventStatus;
  readonly externalEventId: string | null;
  readonly errorCode: string | null;
}

export type ExternalEvent = ExternalEventInput;

const operationIdPattern = /^op_[0-9A-HJKMNP-TV-Z]{26}$/;

export function createCreateOperation(
  input: CreateOperationInput,
): CreateOperation {
  if (!operationIdPattern.test(input.operationId)) {
    throw new DomainValidationError(
      "INVALID_OPERATION_ID",
      "operationIdはop_で始まるULIDで指定してください",
    );
  }

  const title = requireText(input.title, "title");
  if (title.length > 200) {
    throw new DomainValidationError(
      "TITLE_TOO_LONG",
      "titleは200文字以下で指定してください",
    );
  }

  const destinationIds = input.destinationIds.map((id) =>
    requireText(id, "destinationId"),
  );
  if (destinationIds.length < 1 || destinationIds.length > 50) {
    throw new DomainValidationError(
      "INVALID_DESTINATION_COUNT",
      "destinationIdsは1から50件で指定してください",
    );
  }
  if (new Set(destinationIds).size !== destinationIds.length) {
    throw new DomainValidationError(
      "DUPLICATE_DESTINATION_ID",
      "destinationIdsに重複したIDは指定できません",
    );
  }

  assertEventPeriod(input.scheduleType, input.start, input.end);
  assertIanaTimezone(input.timezone);

  return Object.freeze({
    ...input,
    userId: requireText(input.userId, "userId"),
    title,
    destinationIds: Object.freeze(destinationIds),
    eventHash: requireText(input.eventHash, "eventHash"),
  });
}

export function createExternalEvent(input: ExternalEventInput): ExternalEvent {
  const externalEventId = input.externalEventId?.trim() || null;
  const errorCode = input.errorCode?.trim() || null;

  if (input.status === "SUCCESS" && externalEventId === null) {
    throw new DomainValidationError(
      "SUCCESS_EVENT_REQUIRES_ID",
      "成功したExternal EventにはexternalEventIdが必要です",
    );
  }
  if (input.status === "SUCCESS" && errorCode !== null) {
    throw new DomainValidationError(
      "SUCCESS_EVENT_HAS_ERROR",
      "成功したExternal EventにerrorCodeは指定できません",
    );
  }
  if (input.status === "FAILED" && errorCode === null) {
    throw new DomainValidationError(
      "FAILED_EVENT_REQUIRES_CODE",
      "失敗したExternal EventにはerrorCodeが必要です",
    );
  }

  return Object.freeze({
    ...input,
    physicalCalendarId: requireText(
      input.physicalCalendarId,
      "physicalCalendarId",
    ),
    externalEventId,
    errorCode,
  });
}

function assertEventPeriod(
  scheduleType: ScheduleType,
  start: string,
  end: string,
): void {
  const isAllDay = scheduleType === "ALL_DAY";
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const startTime = Date.parse(start);
  const endTime = Date.parse(end);

  if (
    (isAllDay && (!datePattern.test(start) || !datePattern.test(end))) ||
    (!isAllDay && (!Number.isFinite(startTime) || !Number.isFinite(endTime))) ||
    !Number.isFinite(startTime) ||
    !Number.isFinite(endTime) ||
    endTime <= startTime
  ) {
    throw new DomainValidationError(
      "INVALID_EVENT_PERIOD",
      "endはstartより後の有効な日時で指定してください",
    );
  }
}

function assertIanaTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    throw new DomainValidationError(
      "INVALID_TIMEZONE",
      "timezoneは有効なIANA Time Zoneで指定してください",
    );
  }
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new DomainValidationError(
      "REQUIRED_TEXT",
      `${field}は空にできません`,
    );
  }
  return normalized;
}
