import type { CalendarAccessRole } from "@schedule-hub/shared";
import {
  CalendarCatalogProviderError,
  type CalendarCatalogProvider,
  type CalendarCatalogResult,
} from "../../application/ports/calendar-catalog-provider.js";
import type { CalendarConnectionCredentials } from "../../application/ports/calendar-provider.js";
import {
  GoogleCalendarApiError,
  type RefreshedGoogleAccessToken,
} from "./google-calendar-adapter.js";

export interface GoogleCalendarListEntry {
  readonly id: string;
  readonly summary: string;
  readonly accessRole: CalendarAccessRole;
}

export interface GoogleCalendarListPage {
  readonly calendars: readonly GoogleCalendarListEntry[];
  readonly nextPageToken: string | null;
}

export interface GoogleCalendarCatalogApi {
  refreshAccessToken(refreshToken: string): Promise<RefreshedGoogleAccessToken>;
  listCalendarPage(
    accessToken: string,
    pageToken?: string,
  ): Promise<GoogleCalendarListPage>;
}

export interface GoogleCalendarCatalogAdapterOptions {
  readonly nowEpochSeconds?: () => number;
}

export class GoogleCalendarCatalogAdapter implements CalendarCatalogProvider {
  readonly #nowEpochSeconds: () => number;

  public constructor(
    private readonly api: GoogleCalendarCatalogApi,
    options: GoogleCalendarCatalogAdapterOptions = {},
  ) {
    this.#nowEpochSeconds =
      options.nowEpochSeconds ?? (() => Math.floor(Date.now() / 1000));
  }

  public async listCalendars(
    credentials: CalendarConnectionCredentials,
  ): Promise<CalendarCatalogResult> {
    try {
      const token = await this.resolveAccessToken(credentials);
      const calendars: GoogleCalendarListEntry[] = [];
      const visitedPageTokens = new Set<string>();
      let pageToken: string | undefined;
      let hasNextPage = true;
      while (hasNextPage) {
        const page = await this.api.listCalendarPage(
          token.accessToken,
          pageToken,
        );
        calendars.push(...page.calendars);
        if (page.nextPageToken === null) {
          hasNextPage = false;
          continue;
        }
        if (visitedPageTokens.has(page.nextPageToken)) {
          throw new GoogleCalendarApiError(
            "PERMANENT",
            "Google CalendarListのpageTokenが循環しています",
          );
        }
        visitedPageTokens.add(page.nextPageToken);
        pageToken = page.nextPageToken;
      }

      return {
        calendars: calendars.map((calendar) => ({
          externalCalendarId: calendar.id,
          name: calendar.summary,
          accessRole: calendar.accessRole,
        })),
        credentialUpdate: token.credentialUpdate,
      };
    } catch (cause: unknown) {
      throw new CalendarCatalogProviderError(
        cause instanceof GoogleCalendarApiError && cause.kind === "AUTH"
          ? "AUTH"
          : "TRANSIENT",
        "Google Calendar一覧を取得できませんでした",
        { cause },
      );
    }
  }

  private async resolveAccessToken(
    credentials: CalendarConnectionCredentials,
  ): Promise<{
    readonly accessToken: string;
    readonly credentialUpdate: RefreshedGoogleAccessToken | null;
  }> {
    if (credentials.accessTokenExpiresAt > this.#nowEpochSeconds() + 60) {
      return { accessToken: credentials.accessToken, credentialUpdate: null };
    }
    const refreshed = await this.api.refreshAccessToken(
      credentials.refreshToken,
    );
    return { accessToken: refreshed.accessToken, credentialUpdate: refreshed };
  }
}
