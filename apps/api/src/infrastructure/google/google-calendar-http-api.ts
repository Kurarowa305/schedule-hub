import {
  GoogleCalendarApiError,
  type GoogleCalendarApi,
  type GoogleEventInsertRequest,
  type RefreshedGoogleAccessToken,
} from "./google-calendar-adapter.js";

export interface GoogleCalendarHttpApiOptions {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
  readonly nowEpochSeconds?: () => number;
}

export class GoogleCalendarHttpApi implements GoogleCalendarApi {
  readonly #fetch: typeof globalThis.fetch;
  readonly #timeoutMs: number;
  readonly #nowEpochSeconds: () => number;

  public constructor(private readonly options: GoogleCalendarHttpApiOptions) {
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#timeoutMs = options.timeoutMs ?? 10_000;
    this.#nowEpochSeconds =
      options.nowEpochSeconds ?? (() => Math.floor(Date.now() / 1000));
  }

  public async refreshAccessToken(
    refreshToken: string,
  ): Promise<RefreshedGoogleAccessToken> {
    const body = new URLSearchParams({
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });
    const response = await this.request(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(this.#timeoutMs),
      },
    );
    if (!response.ok) {
      throw new GoogleCalendarApiError(
        oauthErrorKind(response.status),
        `Google OAuthのToken更新に失敗しました（HTTP ${response.status}）`,
      );
    }
    const token = (await response.json()) as {
      readonly access_token?: unknown;
      readonly expires_in?: unknown;
    };
    if (
      typeof token.access_token !== "string" ||
      typeof token.expires_in !== "number" ||
      token.expires_in <= 0
    ) {
      throw new GoogleCalendarApiError(
        "PERMANENT",
        "Google OAuthから不正なToken応答が返されました",
      );
    }
    return {
      accessToken: token.access_token,
      accessTokenExpiresAt: this.#nowEpochSeconds() + token.expires_in,
    };
  }

  public async insertEvent(
    accessToken: string,
    request: GoogleEventInsertRequest,
  ): Promise<{ readonly id: string }> {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        request.calendarId,
      )}/events`,
    );
    if (request.sendUpdates !== undefined) {
      url.searchParams.set("sendUpdates", request.sendUpdates);
    }

    const response = await this.request(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(request.event),
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    if (!response.ok) {
      throw new GoogleCalendarApiError(
        calendarErrorKind(response.status),
        `Google Calendar APIに失敗しました（HTTP ${response.status}）`,
      );
    }
    const body = (await response.json()) as { readonly id?: unknown };
    if (typeof body.id !== "string" || body.id.length === 0) {
      throw new GoogleCalendarApiError(
        "PERMANENT",
        "Google Calendar APIから不正なEvent応答が返されました",
      );
    }
    return { id: body.id };
  }

  private async request(
    input: Parameters<typeof globalThis.fetch>[0],
    init: Parameters<typeof globalThis.fetch>[1],
  ): Promise<Response> {
    try {
      return await this.#fetch(input, init);
    } catch (error: unknown) {
      const kind =
        isNamedError(error, "TimeoutError") || isNamedError(error, "AbortError")
          ? "TIMEOUT"
          : "NETWORK";
      throw new GoogleCalendarApiError(kind, "Google API通信に失敗しました", {
        cause: error,
      });
    }
  }
}

function calendarErrorKind(status: number) {
  if (status === 401) return "AUTH" as const;
  if (status === 409) return "DUPLICATE" as const;
  if (status === 429) return "RATE_LIMIT" as const;
  if (status >= 500) return "SERVER" as const;
  return "PERMANENT" as const;
}

function oauthErrorKind(status: number) {
  if (status === 400 || status === 401) return "AUTH" as const;
  return calendarErrorKind(status);
}

function isNamedError(error: unknown, name: string): boolean {
  return error instanceof Error && error.name === name;
}
