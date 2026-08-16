import { randomUUID } from "node:crypto";
import { createPhysicalCalendar } from "@schedule-hub/shared";
import {
  CalendarCatalogProviderError,
  type CalendarCatalogProvider,
} from "../ports/calendar-catalog-provider.js";
import type { CalendarCredentialUpdate } from "../ports/calendar-provider.js";
import type {
  StoredCalendarConnection,
  StoredPhysicalCalendar,
} from "../ports/schedule-hub-repository.js";

export type { StoredPhysicalCalendar } from "../ports/schedule-hub-repository.js";

export type CalendarSyncErrorCode =
  | "CONNECTION_NOT_FOUND"
  | "REAUTH_REQUIRED"
  | "PROVIDER_AUTH_EXPIRED"
  | "PROVIDER_ERROR";

export class CalendarSyncError extends Error {
  public constructor(
    public readonly code: CalendarSyncErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CalendarSyncError";
  }
}

export interface CalendarSyncStore {
  getCalendarConnection(
    userId: string,
    connectionId: string,
  ): Promise<StoredCalendarConnection | null>;
  listPhysicalCalendarsForAccount(
    userId: string,
    provider: "GOOGLE",
    accountIdentifier: string,
  ): Promise<readonly StoredPhysicalCalendar[]>;
  putPhysicalCalendar(
    userId: string,
    calendar: StoredPhysicalCalendar,
  ): Promise<void>;
  updateCalendarConnectionCredentials(
    userId: string,
    connectionId: string,
    update: CalendarCredentialUpdate,
  ): Promise<void>;
  markCalendarConnectionReauthRequired(
    userId: string,
    connectionId: string,
  ): Promise<void>;
}

export interface CalendarSyncServiceDependencies {
  readonly store: CalendarSyncStore;
  readonly provider: CalendarCatalogProvider;
  readonly generatePhysicalCalendarId?: () => string;
  readonly now?: () => string;
}

export class CalendarSyncService {
  readonly #generatePhysicalCalendarId: () => string;
  readonly #now: () => string;

  public constructor(
    private readonly dependencies: CalendarSyncServiceDependencies,
  ) {
    this.#generatePhysicalCalendarId =
      dependencies.generatePhysicalCalendarId ?? (() => `pcal_${randomUUID()}`);
    this.#now = dependencies.now ?? (() => new Date().toISOString());
  }

  public async sync(input: {
    readonly userId: string;
    readonly connectionId: string;
  }): Promise<{ readonly connectionId: string; readonly syncedCount: number }> {
    const connection = await this.dependencies.store.getCalendarConnection(
      input.userId,
      input.connectionId,
    );
    if (connection === null) {
      throw new CalendarSyncError(
        "CONNECTION_NOT_FOUND",
        "Calendar Connectionが見つかりません",
      );
    }
    if (connection.status !== "ACTIVE") {
      throw new CalendarSyncError(
        "REAUTH_REQUIRED",
        "Calendar Providerの再認証が必要です",
      );
    }

    let catalog;
    try {
      catalog = await this.dependencies.provider.listCalendars({
        accessToken: connection.accessToken,
        refreshToken: connection.refreshToken,
        accessTokenExpiresAt: connection.accessTokenExpiresAt,
      });
    } catch (cause: unknown) {
      if (
        cause instanceof CalendarCatalogProviderError &&
        cause.kind === "AUTH"
      ) {
        await this.dependencies.store.markCalendarConnectionReauthRequired(
          input.userId,
          input.connectionId,
        );
        throw new CalendarSyncError(
          "PROVIDER_AUTH_EXPIRED",
          "Calendar Providerの認証が失効しています",
          { cause },
        );
      }
      throw new CalendarSyncError(
        "PROVIDER_ERROR",
        "Calendar一覧を同期できませんでした",
        { cause },
      );
    }

    if (catalog.credentialUpdate !== null) {
      await this.dependencies.store.updateCalendarConnectionCredentials(
        input.userId,
        input.connectionId,
        catalog.credentialUpdate,
      );
    }

    const existing =
      await this.dependencies.store.listPhysicalCalendarsForAccount(
        input.userId,
        connection.provider,
        connection.accountIdentifier,
      );
    const byExternalId = new Map(
      existing.map((calendar) => [calendar.externalCalendarId, calendar]),
    );
    const seen = new Set<string>();
    const timestamp = this.#now();

    for (const entry of catalog.calendars) {
      seen.add(entry.externalCalendarId);
      const previous = byExternalId.get(entry.externalCalendarId);
      const calendar = createPhysicalCalendar({
        physicalCalendarId:
          previous?.physicalCalendarId ?? this.#generatePhysicalCalendarId(),
        provider: "GOOGLE",
        connectionId: connection.connectionId,
        externalCalendarId: entry.externalCalendarId,
        name: entry.name,
        accessRole: entry.accessRole,
        writable: entry.accessRole === "owner" || entry.accessRole === "writer",
        status: "ACTIVE",
        eventColorId: previous?.eventColorId ?? null,
      });
      await this.dependencies.store.putPhysicalCalendar(input.userId, {
        ...calendar,
        createdAt: previous?.createdAt ?? timestamp,
        updatedAt: timestamp,
      });
    }

    for (const previous of existing) {
      if (seen.has(previous.externalCalendarId)) continue;
      await this.dependencies.store.putPhysicalCalendar(input.userId, {
        ...previous,
        connectionId: connection.connectionId,
        writable: false,
        status: "DELETED",
        updatedAt: timestamp,
      });
    }

    return {
      connectionId: connection.connectionId,
      syncedCount: catalog.calendars.length,
    };
  }
}
