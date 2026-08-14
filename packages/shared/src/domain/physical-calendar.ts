import { DomainValidationError } from "./validation-error.js";

export type CalendarProvider = "GOOGLE";
export type PhysicalCalendarStatus = "ACTIVE" | "DELETED";
export type CalendarAccessRole =
  "owner" | "writer" | "reader" | "freeBusyReader";

export interface PhysicalCalendarInput {
  readonly physicalCalendarId: string;
  readonly provider: CalendarProvider;
  readonly connectionId: string;
  readonly externalCalendarId: string;
  readonly name: string;
  readonly accessRole: CalendarAccessRole;
  readonly writable: boolean;
  readonly status: PhysicalCalendarStatus;
  readonly eventColorId: string | null;
}

export type PhysicalCalendar = PhysicalCalendarInput;

export function createPhysicalCalendar(
  input: PhysicalCalendarInput,
): PhysicalCalendar {
  if (input.status === "DELETED" && input.writable) {
    throw new DomainValidationError(
      "DELETED_CALENDAR_WRITABLE",
      "削除済みPhysical Calendarは書き込み可能にできません",
    );
  }

  if (
    (input.accessRole === "reader" || input.accessRole === "freeBusyReader") &&
    input.writable
  ) {
    throw new DomainValidationError(
      "READ_ONLY_CALENDAR_WRITABLE",
      "読み取り専用Calendarは書き込み可能にできません",
    );
  }

  return Object.freeze({
    ...input,
    physicalCalendarId: requireText(input.physicalCalendarId),
    connectionId: requireText(input.connectionId),
    externalCalendarId: requireText(input.externalCalendarId),
    name: requireText(input.name),
    eventColorId: input.eventColorId?.trim() || null,
  });
}

function requireText(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new DomainValidationError(
      "REQUIRED_PHYSICAL_CALENDAR_FIELD",
      "Physical Calendarの必須項目は空にできません",
    );
  }
  return normalized;
}
