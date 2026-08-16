import type { CalendarAccessRole } from "@schedule-hub/shared";
import type {
  CalendarConnectionCredentials,
  CalendarCredentialUpdate,
} from "./calendar-provider.js";

export interface CalendarCatalogEntry {
  readonly externalCalendarId: string;
  readonly name: string;
  readonly accessRole: CalendarAccessRole;
}

export interface CalendarCatalogResult {
  readonly calendars: readonly CalendarCatalogEntry[];
  readonly credentialUpdate: CalendarCredentialUpdate | null;
}

export type CalendarCatalogProviderErrorKind = "AUTH" | "TRANSIENT";

export class CalendarCatalogProviderError extends Error {
  public constructor(
    public readonly kind: CalendarCatalogProviderErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CalendarCatalogProviderError";
  }
}

export interface CalendarCatalogProvider {
  listCalendars(
    credentials: CalendarConnectionCredentials,
  ): Promise<CalendarCatalogResult>;
}
