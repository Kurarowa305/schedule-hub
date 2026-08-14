import { DomainValidationError } from "./validation-error.js";

export { DomainValidationError } from "./validation-error.js";

export interface UserPreferenceInput {
  readonly timezone: string;
  readonly defaultDurationMinutes: number;
  readonly defaultDestinationIds: readonly string[];
}

export interface UserPreference {
  readonly timezone: string;
  readonly defaultDurationMinutes: number;
  readonly defaultDestinationIds: readonly string[];
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

  return Object.freeze({
    timezone: input.timezone,
    defaultDurationMinutes: input.defaultDurationMinutes,
    defaultDestinationIds: Object.freeze(defaultDestinationIds),
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
