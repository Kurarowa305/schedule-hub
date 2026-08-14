import { DomainValidationError } from "./validation-error.js";

export interface LogicalDestinationInput {
  readonly destinationId: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly description: string;
  readonly physicalCalendarIds: readonly string[];
  readonly enabled: boolean;
}

export interface LogicalDestination {
  readonly destinationId: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly description: string;
  readonly physicalCalendarIds: readonly string[];
  readonly enabled: boolean;
}

export function createLogicalDestination(
  input: LogicalDestinationInput,
): LogicalDestination {
  const destinationId = requireText(input.destinationId, "destinationId");
  const name = requireText(input.name, "name");
  const aliases = input.aliases.map((alias) => requireText(alias, "alias"));
  const physicalCalendarIds = input.physicalCalendarIds.map((calendarId) =>
    requireText(calendarId, "physicalCalendarId"),
  );

  if (aliases.length > 20) {
    throw new DomainValidationError(
      "ALIAS_LIMIT_EXCEEDED",
      "aliasesは20件以下で指定してください",
    );
  }
  assertUnique(aliases, "DUPLICATE_DESTINATION_TERM");
  assertUnique(physicalCalendarIds, "DUPLICATE_PHYSICAL_CALENDAR_ID");

  if (input.enabled && physicalCalendarIds.length === 0) {
    throw new DomainValidationError(
      "ACTIVE_DESTINATION_REQUIRES_MAPPING",
      "有効なDestinationには1件以上のMappingが必要です",
    );
  }

  return freezeDestination({
    destinationId,
    name,
    aliases,
    description: input.description.trim(),
    physicalCalendarIds,
    enabled: input.enabled,
  });
}

export function createLogicalDestinationCatalog(
  inputs: readonly LogicalDestinationInput[],
): readonly LogicalDestination[] {
  if (inputs.length > 50) {
    throw new DomainValidationError(
      "DESTINATION_LIMIT_EXCEEDED",
      "Logical Destinationは50件以下で指定してください",
    );
  }

  const destinations = inputs.map(createLogicalDestination);
  const terms = destinations.flatMap(({ name, aliases }) => [name, ...aliases]);
  assertUnique(terms, "DUPLICATE_DESTINATION_TERM");

  return Object.freeze(destinations);
}

export function disableDestinationMapping(
  destination: LogicalDestination,
  physicalCalendarId: string,
): LogicalDestination {
  const targetId = requireText(physicalCalendarId, "physicalCalendarId");
  const physicalCalendarIds = destination.physicalCalendarIds.filter(
    (calendarId) => calendarId !== targetId,
  );

  if (physicalCalendarIds.length === destination.physicalCalendarIds.length) {
    throw new DomainValidationError(
      "DESTINATION_MAPPING_NOT_FOUND",
      "指定されたDestination Mappingは存在しません",
    );
  }

  return freezeDestination({
    ...destination,
    physicalCalendarIds,
    enabled: destination.enabled && physicalCalendarIds.length > 0,
  });
}

function requireText(value: string, field: string): string {
  const normalized = value.normalize("NFKC").trim();
  if (normalized.length === 0) {
    throw new DomainValidationError(
      "INVALID_DESTINATION_ID",
      `${field}は空にできません`,
    );
  }
  return normalized;
}

function assertUnique(values: readonly string[], code: string): void {
  const terms = values.map((value) =>
    value.normalize("NFKC").toLocaleLowerCase(),
  );
  if (new Set(terms).size !== terms.length) {
    throw new DomainValidationError(code, "重複した値は指定できません");
  }
}

function freezeDestination(
  destination: LogicalDestination,
): LogicalDestination {
  return Object.freeze({
    ...destination,
    aliases: Object.freeze([...destination.aliases]),
    physicalCalendarIds: Object.freeze([...destination.physicalCalendarIds]),
  });
}
