import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCognitoPkceAuth } from "./cognito-pkce.js";

const config = {
  domain: "https://schedule-hub.auth.ap-northeast-1.amazoncognito.com",
  clientId: "web-client-id",
  redirectUri: "https://app.example.com/auth/callback",
};

describe("Cognito Authorization Code + PKCE", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("Google IdPを指定した認可URLを生成しstateとverifierを一時保存する", async () => {
    const auth = createCognitoPkceAuth(config, {
      randomBytes: () => new Uint8Array(32).fill(1),
      sha256: async () => new Uint8Array(32).fill(2),
    });

    const url = await auth.createSignInUrl();

    expect(url.origin + url.pathname).toBe(`${config.domain}/oauth2/authorize`);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe(config.clientId);
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri);
    expect(url.searchParams.get("identity_provider")).toBe("Google");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(sessionStorage.getItem("schedule-hub.pkce-state")).not.toBeNull();
    expect(sessionStorage.getItem("schedule-hub.pkce-verifier")).not.toBeNull();
  });

  it("callbackのstateを検証してcodeを交換し認証セッションを保存する", async () => {
    sessionStorage.setItem("schedule-hub.pkce-state", "expected-state");
    sessionStorage.setItem("schedule-hub.pkce-verifier", "verifier");
    const accessToken = jwt({ sub: "user-123", exp: 2_000_000_000 });
    const fetchImplementation = vi.fn(async () =>
      Response.json({ access_token: accessToken, expires_in: 3600 }),
    );
    const auth = createCognitoPkceAuth(config, { fetchImplementation });

    const session = await auth.handleCallback(
      new URL(
        "https://app.example.com/auth/callback?code=code-1&state=expected-state",
      ),
    );

    expect(session).toEqual({
      userId: "user-123",
      accessToken,
      expiresAt: 2_000_000_000_000,
    });
    expect(
      JSON.parse(localStorage.getItem("schedule-hub.auth-session")!),
    ).toEqual(session);
    expect(fetchImplementation).toHaveBeenCalledWith(
      `${config.domain}/oauth2/token`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(sessionStorage.getItem("schedule-hub.pkce-state")).toBeNull();
  });

  it("state不一致ではコードを交換せず拒否する", async () => {
    sessionStorage.setItem("schedule-hub.pkce-state", "expected-state");
    sessionStorage.setItem("schedule-hub.pkce-verifier", "verifier");
    const fetchImplementation = vi.fn();
    const auth = createCognitoPkceAuth(config, { fetchImplementation });

    await expect(
      auth.handleCallback(
        new URL(
          "https://app.example.com/auth/callback?code=code-1&state=attacker-state",
        ),
      ),
    ).rejects.toThrow("state");
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});

function jwt(payload: Readonly<Record<string, unknown>>): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value))
      .replaceAll("=", "")
      .replaceAll("+", "-")
      .replaceAll("/", "_");
  return `${encode({ alg: "none" })}.${encode(payload)}.`;
}
