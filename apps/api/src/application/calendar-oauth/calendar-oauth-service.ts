import { randomBytes, randomUUID } from "node:crypto";
import type { CalendarOAuthProvider } from "../ports/calendar-oauth-provider.js";
import type {
  StoredCalendarConnection,
  StoredOAuthState,
} from "../ports/schedule-hub-repository.js";

export type { StoredCalendarConnection } from "../ports/schedule-hub-repository.js";

export type CalendarOAuthErrorCode =
  | "INVALID_STATE"
  | "EXPIRED_STATE"
  | "PROVIDER_MISMATCH"
  | "TOKEN_EXCHANGE_FAILED";

export class CalendarOAuthError extends Error {
  public constructor(
    public readonly code: CalendarOAuthErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CalendarOAuthError";
  }
}

export interface CalendarOAuthStore {
  putOAuthState(state: StoredOAuthState): Promise<void>;
  takeOAuthState(state: string): Promise<StoredOAuthState | null>;
  findCalendarConnection(
    userId: string,
    provider: "GOOGLE",
    accountIdentifier: string,
  ): Promise<StoredCalendarConnection | null>;
  putCalendarConnection(
    userId: string,
    connection: StoredCalendarConnection,
  ): Promise<void>;
}

export interface CalendarOAuthServiceDependencies {
  readonly store: CalendarOAuthStore;
  readonly provider: CalendarOAuthProvider;
  readonly generateState?: () => string;
  readonly generateConnectionId?: () => string;
  readonly nowEpochSeconds?: () => number;
  readonly stateTtlSeconds?: number;
}

export interface CalendarOAuthCompletion {
  readonly userId: string;
  readonly connectionId: string;
  readonly provider: "GOOGLE";
  readonly accountIdentifier: string;
  readonly status: "ACTIVE";
}

export class CalendarOAuthService {
  readonly #generateState: () => string;
  readonly #generateConnectionId: () => string;
  readonly #nowEpochSeconds: () => number;
  readonly #stateTtlSeconds: number;

  public constructor(
    private readonly dependencies: CalendarOAuthServiceDependencies,
  ) {
    this.#generateState =
      dependencies.generateState ??
      (() => randomBytes(32).toString("base64url"));
    this.#generateConnectionId =
      dependencies.generateConnectionId ?? (() => `conn_${randomUUID()}`);
    this.#nowEpochSeconds =
      dependencies.nowEpochSeconds ?? (() => Math.floor(Date.now() / 1000));
    this.#stateTtlSeconds = dependencies.stateTtlSeconds ?? 600;
  }

  public async start(input: {
    readonly userId: string;
    readonly provider: "GOOGLE";
  }): Promise<{ readonly authorizationUrl: string }> {
    if (input.userId.trim().length === 0) {
      throw new CalendarOAuthError("INVALID_STATE", "認証ユーザーが必要です");
    }
    const state = this.#generateState();
    const now = this.#nowEpochSeconds();
    await this.dependencies.store.putOAuthState({
      state,
      userId: input.userId,
      provider: input.provider,
      purpose: "CALENDAR_CONNECT",
      createdAt: now,
      ttl: now + this.#stateTtlSeconds,
    });
    return {
      authorizationUrl:
        this.dependencies.provider.createAuthorizationUrl(state),
    };
  }

  public async complete(input: {
    readonly provider: string;
    readonly state: string;
    readonly code: string;
  }): Promise<CalendarOAuthCompletion> {
    const oauthState = await this.dependencies.store.takeOAuthState(
      input.state,
    );
    if (oauthState === null || oauthState.purpose !== "CALENDAR_CONNECT") {
      throw new CalendarOAuthError("INVALID_STATE", "OAuth stateが無効です");
    }
    const now = this.#nowEpochSeconds();
    if (oauthState.ttl <= now) {
      throw new CalendarOAuthError(
        "EXPIRED_STATE",
        "OAuth stateの期限が切れています",
      );
    }
    if (input.provider !== oauthState.provider) {
      throw new CalendarOAuthError(
        "PROVIDER_MISMATCH",
        "OAuth providerが開始時と一致しません",
      );
    }

    let authorization;
    try {
      authorization =
        await this.dependencies.provider.exchangeAuthorizationCode(input.code);
    } catch (cause: unknown) {
      throw new CalendarOAuthError(
        "TOKEN_EXCHANGE_FAILED",
        "Google OAuthの認可コード交換に失敗しました",
        { cause },
      );
    }

    const existing = await this.dependencies.store.findCalendarConnection(
      oauthState.userId,
      oauthState.provider,
      authorization.accountIdentifier,
    );
    const refreshToken =
      nonEmpty(authorization.refreshToken) ?? existing?.refreshToken;
    if (refreshToken === undefined) {
      throw new CalendarOAuthError(
        "TOKEN_EXCHANGE_FAILED",
        "Google OAuthからRefresh Tokenを取得できませんでした",
      );
    }

    const timestamp = new Date(now * 1000).toISOString();
    const connection: StoredCalendarConnection = {
      connectionId: existing?.connectionId ?? this.#generateConnectionId(),
      provider: "GOOGLE",
      accountIdentifier: authorization.accountIdentifier,
      accessToken: authorization.accessToken,
      refreshToken,
      accessTokenExpiresAt: authorization.accessTokenExpiresAt,
      status: "ACTIVE",
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    await this.dependencies.store.putCalendarConnection(
      oauthState.userId,
      connection,
    );
    return {
      userId: oauthState.userId,
      connectionId: connection.connectionId,
      provider: connection.provider,
      accountIdentifier: connection.accountIdentifier,
      status: "ACTIVE",
    };
  }
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value.trim().length === 0 ? undefined : value;
}
