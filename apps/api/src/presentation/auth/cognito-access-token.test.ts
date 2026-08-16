import { describe, expect, it } from "vitest";
import {
  AuthenticationError,
  assertUserOwnership,
  authenticateCognitoAccessToken,
} from "./cognito-access-token.js";

const now = 1_800_000_000;
const baseClaims = {
  sub: "cognito-user-123",
  token_use: "access",
  client_id: "web-client",
  scope: "openid email profile",
  exp: String(now + 3600),
};

describe("検証済みCognito Access Tokenクレーム", () => {
  it("WebとMCPの同じsubを同じSchedule Hub Userへ写像する", () => {
    const web = authenticateCognitoAccessToken(baseClaims, {
      clientId: "web-client",
      nowEpochSeconds: now,
    });
    const mcp = authenticateCognitoAccessToken(
      {
        ...baseClaims,
        client_id: "mcp-client",
        scope: "openid schedule-hub-mcp/use",
        aud: "https://api.example.com/mcp",
      },
      {
        clientId: "mcp-client",
        requiredScope: "schedule-hub-mcp/use",
        resource: "https://api.example.com/mcp",
        nowEpochSeconds: now,
      },
    );

    expect(web.userId).toBe("cognito-user-123");
    expect(mcp.userId).toBe(web.userId);
  });

  it.each([
    ["subなし", { ...baseClaims, sub: undefined }, { clientId: "web-client" }],
    [
      "ID Token",
      { ...baseClaims, token_use: "id" },
      { clientId: "web-client" },
    ],
    ["別App Client", baseClaims, { clientId: "another-client" }],
    [
      "期限切れ",
      { ...baseClaims, exp: String(now) },
      { clientId: "web-client" },
    ],
    [
      "MCP scope不足",
      {
        ...baseClaims,
        client_id: "mcp-client",
        aud: "https://api.example.com/mcp",
      },
      {
        clientId: "mcp-client",
        requiredScope: "schedule-hub-mcp/use",
        resource: "https://api.example.com/mcp",
      },
    ],
    [
      "別MCP resource",
      {
        ...baseClaims,
        client_id: "mcp-client",
        scope: "schedule-hub-mcp/use",
        aud: "https://other.example.com/mcp",
      },
      {
        clientId: "mcp-client",
        requiredScope: "schedule-hub-mcp/use",
        resource: "https://api.example.com/mcp",
      },
    ],
  ])("%sを拒否する", (_name, claims, policy) => {
    expect(() =>
      authenticateCognitoAccessToken(claims, {
        ...policy,
        nowEpochSeconds: now,
      }),
    ).toThrow(AuthenticationError);
  });

  it("認証ユーザーと所有者のsubが異なるアクセスを拒否する", () => {
    const authentication = authenticateCognitoAccessToken(baseClaims, {
      clientId: "web-client",
      nowEpochSeconds: now,
    });

    expect(() =>
      assertUserOwnership(authentication, "another-cognito-user"),
    ).toThrow(AuthenticationError);
    expect(() =>
      assertUserOwnership(authentication, "cognito-user-123"),
    ).not.toThrow();
  });
});
