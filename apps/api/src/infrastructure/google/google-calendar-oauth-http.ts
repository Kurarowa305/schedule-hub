import type {
  CalendarOAuthAuthorization,
  CalendarOAuthProvider,
} from "../../application/ports/calendar-oauth-provider.js";

const authorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
const tokenEndpoint = "https://oauth2.googleapis.com/token";
const userInfoEndpoint = "https://openidconnect.googleapis.com/v1/userinfo";
const scopes = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events",
] as const;

export interface GoogleCalendarOAuthHttpOptions {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
  readonly nowEpochSeconds?: () => number;
}

export class GoogleCalendarOAuthProviderError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "GoogleCalendarOAuthProviderError";
  }
}

export class GoogleCalendarOAuthHttpAdapter implements CalendarOAuthProvider {
  readonly #fetch: typeof globalThis.fetch;
  readonly #timeoutMs: number;
  readonly #nowEpochSeconds: () => number;

  public constructor(private readonly options: GoogleCalendarOAuthHttpOptions) {
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#timeoutMs = options.timeoutMs ?? 10_000;
    this.#nowEpochSeconds =
      options.nowEpochSeconds ?? (() => Math.floor(Date.now() / 1000));
  }

  public createAuthorizationUrl(state: string): string {
    const url = new URL(authorizationEndpoint);
    url.search = new URLSearchParams({
      client_id: this.options.clientId,
      redirect_uri: this.options.redirectUri,
      response_type: "code",
      scope: scopes.join(" "),
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent",
      state,
    }).toString();
    return url.toString();
  }

  public async exchangeAuthorizationCode(
    code: string,
  ): Promise<CalendarOAuthAuthorization> {
    const tokenResponse = await this.request(tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        redirect_uri: this.options.redirectUri,
        grant_type: "authorization_code",
      }).toString(),
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    if (!tokenResponse.ok) {
      throw new GoogleCalendarOAuthProviderError(
        `Google Token endpointに失敗しました（HTTP ${tokenResponse.status}）`,
      );
    }
    const token = (await tokenResponse.json()) as Record<string, unknown>;
    if (
      typeof token.access_token !== "string" ||
      token.access_token.length === 0 ||
      typeof token.expires_in !== "number" ||
      !Number.isFinite(token.expires_in) ||
      token.expires_in <= 0 ||
      (token.refresh_token !== undefined &&
        typeof token.refresh_token !== "string")
    ) {
      throw new GoogleCalendarOAuthProviderError(
        "Google Token endpointから不正な応答が返されました",
      );
    }

    const userInfoResponse = await this.request(userInfoEndpoint, {
      method: "GET",
      headers: { authorization: `Bearer ${token.access_token}` },
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    if (!userInfoResponse.ok) {
      throw new GoogleCalendarOAuthProviderError(
        `Google UserInfo endpointに失敗しました（HTTP ${userInfoResponse.status}）`,
      );
    }
    const userInfo = (await userInfoResponse.json()) as Record<string, unknown>;
    if (
      typeof userInfo.email !== "string" ||
      userInfo.email.length === 0 ||
      userInfo.email_verified !== true
    ) {
      throw new GoogleCalendarOAuthProviderError(
        "Google UserInfoから検証済みemailを取得できませんでした",
      );
    }

    return {
      accountIdentifier: userInfo.email,
      accessToken: token.access_token,
      refreshToken: token.refresh_token as string | undefined,
      accessTokenExpiresAt:
        this.#nowEpochSeconds() + Math.floor(token.expires_in),
    };
  }

  private async request(
    input: Parameters<typeof globalThis.fetch>[0],
    init: Parameters<typeof globalThis.fetch>[1],
  ): Promise<Response> {
    try {
      return await this.#fetch(input, init);
    } catch (cause: unknown) {
      throw new GoogleCalendarOAuthProviderError(
        "Google OAuth endpointへの通信に失敗しました",
        { cause },
      );
    }
  }
}
