import { describe, expect, it, vi } from "vitest";
import {
  GoogleCalendarOAuthHttpAdapter,
  GoogleCalendarOAuthProviderError,
} from "./google-calendar-oauth-http.js";

const options = {
  clientId: "calendar-client-id",
  clientSecret: "calendar-client-secret",
  redirectUri: "https://api.example.com/api/v1/oauth/GOOGLE/callback",
  nowEpochSeconds: () => 1_800_000_000,
};

describe("Google Calendar OAuth HTTP Adapter", () => {
  it("offline access用のGoogle認可URLを生成する", () => {
    const adapter = new GoogleCalendarOAuthHttpAdapter(options);

    const url = new URL(adapter.createAuthorizationUrl("secure-state"));

    expect(`${url.origin}${url.pathname}`).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "calendar-client-id",
      redirect_uri: options.redirectUri,
      response_type: "code",
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent",
      state: "secure-state",
    });
    expect(url.searchParams.get("scope")?.split(" ")).toEqual([
      "openid",
      "email",
      "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
      "https://www.googleapis.com/auth/calendar.events",
    ]);
    expect(url.href).not.toContain("calendar-client-secret");
  });

  it("認可コードをTokenへ交換し、検証済みemailをUserInfoから取得する", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        Response.json({
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_in: 3600,
          token_type: "Bearer",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          sub: "google-account-id",
          email: "calendar-user@example.com",
          email_verified: true,
        }),
      );
    const adapter = new GoogleCalendarOAuthHttpAdapter({ ...options, fetch });

    await expect(
      adapter.exchangeAuthorizationCode("auth-code"),
    ).resolves.toEqual({
      accountIdentifier: "calendar-user@example.com",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      accessTokenExpiresAt: 1_800_003_600,
    });

    const [tokenUrl, tokenInit] = fetch.mock.calls[0] ?? [];
    expect(String(tokenUrl)).toBe("https://oauth2.googleapis.com/token");
    expect(tokenInit).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    expect(new URLSearchParams(String(tokenInit?.body))).toEqual(
      new URLSearchParams({
        code: "auth-code",
        client_id: options.clientId,
        client_secret: options.clientSecret,
        redirect_uri: options.redirectUri,
        grant_type: "authorization_code",
      }),
    );
    expect(fetch.mock.calls[1]?.[1]).toMatchObject({
      method: "GET",
      headers: { authorization: "Bearer access-token" },
    });
  });

  it("再認証でrefresh tokenが省略された応答を許可する", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        Response.json({ access_token: "access-token", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(
        Response.json({
          email: "calendar-user@example.com",
          email_verified: true,
        }),
      );
    const adapter = new GoogleCalendarOAuthHttpAdapter({ ...options, fetch });

    await expect(
      adapter.exchangeAuthorizationCode("auth-code"),
    ).resolves.toEqual(expect.objectContaining({ refreshToken: undefined }));
  });

  it.each([
    ["Token endpoint失敗", [new Response("failed", { status: 400 })]],
    [
      "未検証email",
      [
        Response.json({ access_token: "access-token", expires_in: 3600 }),
        Response.json({ email: "user@example.com", email_verified: false }),
      ],
    ],
  ])("%sをProviderエラーへ変換する", async (_name, responses) => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    for (const response of responses) fetch.mockResolvedValueOnce(response);
    const adapter = new GoogleCalendarOAuthHttpAdapter({ ...options, fetch });

    await expect(
      adapter.exchangeAuthorizationCode("auth-code"),
    ).rejects.toBeInstanceOf(GoogleCalendarOAuthProviderError);
  });
});
