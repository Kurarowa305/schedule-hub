import { describe, expect, it, vi } from "vitest";
import {
  CalendarOAuthError,
  CalendarOAuthService,
  type CalendarOAuthStore,
  type StoredCalendarConnection,
} from "./calendar-oauth-service.js";
import type { CalendarOAuthProvider } from "../ports/calendar-oauth-provider.js";
import type { StoredOAuthState } from "../ports/schedule-hub-repository.js";

const now = 1_800_000_000;

function fixture(options?: {
  readonly state?: StoredOAuthState | null;
  readonly existingConnection?: StoredCalendarConnection | null;
  readonly refreshToken?: string;
}) {
  let oauthState =
    options?.state === undefined
      ? {
          state: "secure-state",
          userId: "user-1",
          provider: "GOOGLE" as const,
          purpose: "CALENDAR_CONNECT" as const,
          createdAt: now,
          ttl: now + 600,
        }
      : options.state;
  const putOAuthState = vi.fn(async (state: StoredOAuthState) => {
    oauthState = state;
  });
  const takeOAuthState = vi.fn(async () => {
    const taken = oauthState;
    oauthState = null;
    return taken;
  });
  const putCalendarConnection = vi.fn(async () => undefined);
  const store: CalendarOAuthStore = {
    putOAuthState,
    takeOAuthState,
    findCalendarConnection: vi.fn(
      async () => options?.existingConnection ?? null,
    ),
    putCalendarConnection,
  };
  const provider: CalendarOAuthProvider = {
    createAuthorizationUrl: vi.fn(
      (state) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
    ),
    exchangeAuthorizationCode: vi.fn(async () => ({
      accountIdentifier: "calendar-user@example.com",
      accessToken: "access-token",
      refreshToken: options?.refreshToken ?? "refresh-token",
      accessTokenExpiresAt: now + 3600,
    })),
  };
  const service = new CalendarOAuthService({
    store,
    provider,
    generateState: () => "secure-state",
    generateConnectionId: () => "conn_generated",
    nowEpochSeconds: () => now,
  });
  return {
    service,
    store,
    provider,
    putOAuthState,
    takeOAuthState,
    putCalendarConnection,
  };
}

describe("Google Calendar OAuth", () => {
  it("認証ユーザーに紐づく10分TTLのstateを保存して認可URLを返す", async () => {
    const context = fixture({ state: null });

    await expect(
      context.service.start({ userId: "user-1", provider: "GOOGLE" }),
    ).resolves.toEqual({
      authorizationUrl:
        "https://accounts.google.com/o/oauth2/v2/auth?state=secure-state",
    });
    expect(context.putOAuthState).toHaveBeenCalledWith({
      state: "secure-state",
      userId: "user-1",
      provider: "GOOGLE",
      purpose: "CALENDAR_CONNECT",
      createdAt: now,
      ttl: now + 600,
    });
  });

  it.each([
    ["存在しないstate", null, "INVALID_STATE"],
    [
      "期限切れstate",
      {
        state: "secure-state",
        userId: "user-1",
        provider: "GOOGLE" as const,
        purpose: "CALENDAR_CONNECT" as const,
        createdAt: now - 601,
        ttl: now,
      },
      "EXPIRED_STATE",
    ],
  ])("%sを拒否する", async (_name, state, code) => {
    const { service, provider } = fixture({ state });

    await expect(
      service.complete({
        provider: "GOOGLE",
        state: "secure-state",
        code: "code",
      }),
    ).rejects.toMatchObject({ code });
    expect(provider.exchangeAuthorizationCode).not.toHaveBeenCalled();
  });

  it("callbackのproviderがstateと異なる場合は拒否する", async () => {
    const { service, provider } = fixture();

    await expect(
      service.complete({
        provider: "MICROSOFT_OUTLOOK",
        state: "secure-state",
        code: "code",
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_MISMATCH" });
    expect(provider.exchangeAuthorizationCode).not.toHaveBeenCalled();
  });

  it("認可コードを交換して新しいCalendarConnectionを保存する", async () => {
    const { service, putCalendarConnection } = fixture();

    await expect(
      service.complete({
        provider: "GOOGLE",
        state: "secure-state",
        code: "code",
      }),
    ).resolves.toMatchObject({
      connectionId: "conn_generated",
      status: "ACTIVE",
    });
    expect(putCalendarConnection).toHaveBeenCalledWith("user-1", {
      connectionId: "conn_generated",
      provider: "GOOGLE",
      accountIdentifier: "calendar-user@example.com",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      accessTokenExpiresAt: now + 3600,
      status: "ACTIVE",
      createdAt: new Date(now * 1000).toISOString(),
      updatedAt: new Date(now * 1000).toISOString(),
    });
  });

  it("再認証ではConnection IDと既存refresh tokenを維持してACTIVEへ戻す", async () => {
    const existingConnection: StoredCalendarConnection = {
      connectionId: "conn_existing",
      provider: "GOOGLE",
      accountIdentifier: "calendar-user@example.com",
      accessToken: "old-access",
      refreshToken: "old-refresh",
      accessTokenExpiresAt: now - 1,
      status: "REAUTH_REQUIRED",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const { service, putCalendarConnection } = fixture({
      existingConnection,
      refreshToken: "",
    });

    const result = await service.complete({
      provider: "GOOGLE",
      state: "secure-state",
      code: "code",
    });

    expect(result.connectionId).toBe("conn_existing");
    expect(putCalendarConnection).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        connectionId: "conn_existing",
        refreshToken: "old-refresh",
        status: "ACTIVE",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    );
  });

  it("新規接続でrefresh tokenを取得できなければ保存しない", async () => {
    const context = fixture({ refreshToken: "" });

    await expect(
      context.service.complete({
        provider: "GOOGLE",
        state: "secure-state",
        code: "code",
      }),
    ).rejects.toMatchObject({ code: "TOKEN_EXCHANGE_FAILED" });
    expect(context.putCalendarConnection).not.toHaveBeenCalled();
  });

  it("Token交換失敗時もstateを消費し、Connectionを保存しない", async () => {
    const context = fixture();
    vi.mocked(context.provider.exchangeAuthorizationCode).mockRejectedValue(
      new Error("token endpoint failed"),
    );

    await expect(
      context.service.complete({
        provider: "GOOGLE",
        state: "secure-state",
        code: "code",
      }),
    ).rejects.toBeInstanceOf(CalendarOAuthError);
    await expect(
      context.service.complete({
        provider: "GOOGLE",
        state: "secure-state",
        code: "code",
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
    expect(context.putCalendarConnection).not.toHaveBeenCalled();
  });
});
