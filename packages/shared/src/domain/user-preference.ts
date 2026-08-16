import { DomainValidationError } from "./validation-error.js";

export { DomainValidationError } from "./validation-error.js";

export type CalendarEventVisibilityPreference =
  "default" | "public" | "private" | "confidential";

export interface UserPreferenceInput {
  readonly timezone: string;
  readonly defaultDurationMinutes: number;
  readonly defaultDestinationIds: readonly string[];
  readonly defaultReminderMinutes?: readonly number[];
  readonly defaultEventColorId?: string | null;
  readonly defaultVisibility?: CalendarEventVisibilityPreference;
}

export interface UserPreference {
  readonly timezone: string;
  readonly defaultDurationMinutes: number;
  readonly defaultDestinationIds: readonly string[];
  readonly defaultReminderMinutes?: readonly number[];
  readonly defaultEventColorId?: string | null;
  readonly defaultVisibility?: CalendarEventVisibilityPreference;
}

export function createUserPreference(
  input: UserPreferenceInput,
): UserPreference {
  if (
    !Number.isInteger(input.defaultDurationMinutes) ||
    input.defaultDurationMinutes < 1 ||
    input.defaultDurationMinutes > 1440
  ) {
    throw new DomainValidationError(
      "INVALID_DEFAULT_DURATION",
      "defaultDurationMinutesは1から1440の整数で指定してください",
    );
  }

  assertIanaTimezone(input.timezone);
  const defaultDestinationIds = normalizeUniqueDestinationIds(
    input.defaultDestinationIds,
  );
  const defaultReminderMinutes = normalizeReminderMinutes(
    input.defaultReminderMinutes,
  );
  assertEventColorId(input.defaultEventColorId);

  return Object.freeze({
    timezone: input.timezone,
    defaultDurationMinutes: input.defaultDurationMinutes,
    defaultDestinationIds: Object.freeze(defaultDestinationIds),
    ...(defaultReminderMinutes === undefined
      ? {}
      : { defaultReminderMinutes: Object.freeze(defaultReminderMinutes) }),
    ...(input.defaultEventColorId === undefined
      ? {}
      : { defaultEventColorId: input.defaultEventColorId }),
    ...(input.defaultVisibility === undefined
      ? {}
      : { defaultVisibility: input.defaultVisibility }),
  });
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

function normalizeUniqueDestinationIds(
  destinationIds: readonly string[],
): string[] {
  const normalized = destinationIds.map((destinationId) =>
    destinationId.trim(),
  );
  if (normalized.some((destinationId) => destinationId.length === 0)) {
    throw new DomainValidationError(
      "INVALID_DESTINATION_ID",
      "defaultDestinationIdsに空のIDは指定できません",
    );
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new DomainValidationError(
      "DUPLICATE_DESTINATION_ID",
      "defaultDestinationIdsに重複したIDは指定できません",
    );
  }
  return normalized;
}

function normalizeReminderMinutes(
  value: readonly number[] | undefined,
): number[] | undefined {
  if (value === undefined) return undefined;
  if (
    value.some(
      (minutes) =>
        !Number.isInteger(minutes) || minutes < 0 || minutes > 40_320,
    )
  ) {
    throw new DomainValidationError(
      "INVALID_DEFAULT_REMINDER",
      "defaultReminderMinutesは0から40320の整数で指定してください",
    );
  }
  return [...new Set(value)].sort((left, right) => left - right);
}

function assertEventColorId(value: string | null | undefined): void {
  if (
    value !== undefined &&
    value !== null &&
    !/^(?:[1-9]|1[01])$/.test(value)
  ) {
    throw new DomainValidationError(
      "INVALID_DEFAULT_EVENT_COLOR",
      "defaultEventColorIdは1から11で指定してください",
    );
  }
}
