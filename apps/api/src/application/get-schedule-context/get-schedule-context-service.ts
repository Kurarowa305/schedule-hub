import type { LogicalDestination, UserPreference } from "@schedule-hub/shared";
import type { Page } from "../ports/schedule-hub-repository.js";

const destinationPageSize = 50;

export interface ScheduleContextStore {
  getUserPreference(userId: string): Promise<UserPreference | null>;
  listLogicalDestinations(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<Page<LogicalDestination>>;
}

export interface ScheduleContextDestination {
  readonly id: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly description: string;
}

export interface ScheduleContext {
  readonly currentDateTime: string;
  readonly timezone: string;
  readonly defaultDurationMinutes: number;
  readonly defaultDestinationIds: readonly string[];
  readonly destinations: readonly ScheduleContextDestination[];
}

export interface GetScheduleContextDependencies {
  readonly store: ScheduleContextStore;
  readonly now?: () => Date;
}

export class GetScheduleContextService {
  readonly #store: ScheduleContextStore;
  readonly #now: () => Date;

  public constructor(dependencies: GetScheduleContextDependencies) {
    this.#store = dependencies.store;
    this.#now = dependencies.now ?? (() => new Date());
  }

  public async get(userId: string): Promise<ScheduleContext> {
    const preference = await this.#store.getUserPreference(userId);
    if (preference === null) {
      throw new Error("ユーザー設定が見つかりません");
    }

    const destinations = (await this.#listAllDestinations(userId)).filter(
      ({ enabled }) => enabled,
    );
    const activeDestinationIds = new Set(
      destinations.map(({ destinationId }) => destinationId),
    );

    return {
      currentDateTime: formatRfc3339InTimezone(
        this.#now(),
        preference.timezone,
      ),
      timezone: preference.timezone,
      defaultDurationMinutes: preference.defaultDurationMinutes,
      defaultDestinationIds: preference.defaultDestinationIds.filter((id) =>
        activeDestinationIds.has(id),
      ),
      destinations: destinations.map(
        ({ destinationId, name, aliases, description }) => ({
          id: destinationId,
          name,
          aliases,
          description,
        }),
      ),
    };
  }

  async #listAllDestinations(userId: string): Promise<LogicalDestination[]> {
    const destinations: LogicalDestination[] = [];
    let cursor: string | undefined;

    do {
      const page = await this.#store.listLogicalDestinations(
        userId,
        destinationPageSize,
        cursor,
      );
      destinations.push(...page.items);
      if (destinations.length > destinationPageSize) {
        throw new Error("Logical Destinationの上限を超えています");
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);

    return destinations;
  }
}

function formatRfc3339InTimezone(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    calendar: "iso8601",
    numberingSystem: "latn",
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  );
  const year = requireDatePart(parts, "year");
  const month = requireDatePart(parts, "month");
  const day = requireDatePart(parts, "day");
  const hour = requireDatePart(parts, "hour");
  const minute = requireDatePart(parts, "minute");
  const second = requireDatePart(parts, "second");
  const localTimeAsUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  const instantWithoutMilliseconds = Math.floor(date.getTime() / 1000) * 1000;
  const offsetMinutes = Math.round(
    (localTimeAsUtc - instantWithoutMilliseconds) / 60_000,
  );

  return `${year}-${month}-${day}T${hour}:${minute}:${second}${formatOffset(offsetMinutes)}`;
}

function requireDatePart(
  parts: Readonly<Record<string, string>>,
  name: string,
): string {
  const value = parts[name];
  if (value === undefined) {
    throw new Error(`日時の${name}を取得できません`);
  }
  return value;
}

function formatOffset(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = String(absolute % 60).padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}
