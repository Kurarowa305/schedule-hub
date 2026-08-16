import { describe, expect, it, vi } from "vitest";
import { GoogleCalendarHttpApi } from "./google-calendar-http-api.js";

describe("GoogleCalendarHttpApiのToken更新", () => {
  it("OAuth Token endpointの応答を保存可能なCredentialへ変換する", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      new Response(
        JSON.stringify({
          access_token: "new-access-token",
          expires_in: 3600,
          token_type: "Bearer",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    const api = new GoogleCalendarHttpApi({
      clientId: "client-id",
      clientSecret: "client-secret",
      fetch,
      nowEpochSeconds: () => 1_700_000_000,
    });

    await expect(api.refreshAccessToken("refresh-token")).resolves.toEqual({
      accessToken: "new-access-token",
      accessTokenExpiresAt: 1_700_003_600,
    });

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://oauth2.googleapis.com/token");
    expect(init).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body:
        "client_id=client-id&client_secret=client-secret&" +
        "refresh_token=refresh-token&grant_type=refresh_token",
    });
  });
});
