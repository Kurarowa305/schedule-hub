import { describe, expect, it, vi } from "vitest";
import {
  createWebRestApiEndpoint,
  WebRestApiError,
  type WebRestApiAuthenticator,
  type WebRestApiExecutor,
} from "./web-rest-api-endpoint.js";

const routeCases = [
  ["GET", "/api/v1/me", "GET_ME"],
  ["PATCH", "/api/v1/me/preferences", "UPDATE_PREFERENCES"],
  ["GET", "/api/v1/calendar-connections", "LIST_CONNECTIONS"],
  ["POST", "/api/v1/calendar-connections/GOOGLE/oauth/start", "START_OAUTH"],
  ["GET", "/api/v1/oauth/GOOGLE/callback?code=abc&state=xyz", "OAUTH_CALLBACK"],
  ["DELETE", "/api/v1/calendar-connections/conn_1", "DISCONNECT_CALENDAR"],
  [
    "POST",
    "/api/v1/calendar-connections/conn_1/sync-calendars",
    "SYNC_CALENDARS",
  ],
  ["GET", "/api/v1/physical-calendars", "LIST_PHYSICAL_CALENDARS"],
  ["PATCH", "/api/v1/physical-calendars/pcal_1", "UPDATE_PHYSICAL_CALENDAR"],
  ["GET", "/api/v1/destinations", "LIST_DESTINATIONS"],
  ["POST", "/api/v1/destinations", "CREATE_DESTINATION"],
  ["PATCH", "/api/v1/destinations/dest_1", "UPDATE_DESTINATION"],
  ["GET", "/api/v1/external-display-targets", "LIST_DISPLAY_TARGETS"],
  ["PUT", "/api/v1/external-display-targets/TIMETREE", "PUT_DISPLAY_TARGET"],
  ["GET", "/api/v1/operations", "LIST_OPERATIONS"],
  ["GET", "/api/v1/operations/op_1", "GET_OPERATION"],
] as const;

describe("Web REST API Endpoint", () => {
  it.each(routeCases)(
    "%s %sを%sへルーティングする",
    async (method, path, operation) => {
      const { endpoint, execute } = fixture();

      const body = method.charCodeAt(0) === 80 ? {} : undefined;
      const response = await endpoint.fetch(request(method, path, body));

      expect(response.status).toBe(operation === "OAUTH_CALLBACK" ? 302 : 200);
      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({ operation }),
      );
    },
  );

  it("JWT認証済みuserIdだけをUse Caseへ渡す", async () => {
    const { endpoint, execute } = fixture();

    const response = await endpoint.fetch(
      request("PATCH", "/api/v1/me/preferences", {
        timezone: "Asia/Tokyo",
      }),
    );

    expect(response.status).toBe(200);
    expect(execute).toHaveBeenCalledWith({
      operation: "UPDATE_PREFERENCES",
      userId: "user-from-jwt",
      pathParameters: {},
      query: {},
      body: { timezone: "Asia/Tokyo" },
    });
  });

  it("Request bodyのuserId指定を拒否する", async () => {
    const { endpoint, execute } = fixture();

    const response = await endpoint.fetch(
      request("POST", "/api/v1/destinations", {
        userId: "another-user",
        name: "仕事",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("OAuth callbackだけはJWTなしでcode/stateとProviderを渡す", async () => {
    const { endpoint, authenticate, execute } = fixture();

    await endpoint.fetch(
      request(
        "GET",
        "/api/v1/oauth/GOOGLE/callback?code=code-value&state=state-value",
        undefined,
        false,
      ),
    );

    expect(authenticate).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledWith({
      operation: "OAUTH_CALLBACK",
      userId: null,
      pathParameters: { provider: "GOOGLE" },
      query: { code: "code-value", state: "state-value" },
      body: null,
    });
  });

  it("認証失敗を統一401 JSONで返す", async () => {
    const { endpoint } = fixture({ authenticationError: true });

    const response = await endpoint.fetch(request("GET", "/api/v1/me"));

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "認証が必要です",
        details: {},
      },
    });
  });

  it("limit/cursorとCalendar filterをUse Caseへ渡す", async () => {
    const { endpoint, execute } = fixture();

    await endpoint.fetch(
      request("GET", "/api/v1/operations?limit=50&cursor=opaque%2Bcursor"),
    );
    await endpoint.fetch(
      request(
        "GET",
        "/api/v1/physical-calendars?connectionId=conn_1&writableOnly=true",
      ),
    );

    expect(execute).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        query: { limit: "50", cursor: "opaque+cursor" },
      }),
    );
    expect(execute).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        query: { connectionId: "conn_1", writableOnly: "true" },
      }),
    );
  });

  it("一覧のopaque cursorを共通Response形式で返す", async () => {
    const { endpoint } = fixture({
      result: {
        kind: "page",
        data: [{ operationId: "op_1" }],
        nextCursor: "next",
      },
    });

    const response = await endpoint.fetch(request("GET", "/api/v1/operations"));

    await expect(response.json()).resolves.toEqual({
      data: [{ operationId: "op_1" }],
      nextCursor: "next",
    });
  });

  it("業務エラーのHTTP statusと共通Error形式を維持する", async () => {
    const { endpoint } = fixture({
      error: new WebRestApiError("NOT_FOUND", "対象が見つかりません", 404, {
        resource: "destination",
      }),
    });

    const response = await endpoint.fetch(
      request("PATCH", "/api/v1/destinations/dest_missing", { enabled: false }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "NOT_FOUND",
        message: "対象が見つかりません",
        details: { resource: "destination" },
      },
    });
  });

  it("予期しない例外の詳細を公開しない", async () => {
    const { endpoint } = fixture({ error: new Error("refresh-token-secret") });

    const response = await endpoint.fetch(request("GET", "/api/v1/me"));
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).toContain("INTERNAL_ERROR");
    expect(body).not.toContain("refresh-token-secret");
  });

  it.each([
    ["POST", "/api/v1/destinations", "{", 400],
    ["POST", "/api/v1/destinations", undefined, 400],
    ["GET", "/api/v1/unknown", undefined, 404],
    ["POST", "/api/v1/me", undefined, 405],
  ] as const)(
    "不正Request %s %sを拒否する",
    async (method, path, body, status) => {
      const { endpoint, execute } = fixture();

      const response = await endpoint.fetch(request(method, path, body));

      expect(response.status).toBe(status);
      expect(execute).not.toHaveBeenCalled();
    },
  );
});

function fixture(
  options: {
    readonly result?: Awaited<ReturnType<WebRestApiExecutor["execute"]>>;
    readonly error?: Error;
    readonly authenticationError?: boolean;
  } = {},
) {
  const authenticate = vi.fn<WebRestApiAuthenticator["authenticate"]>(
    async () => {
      if (options.authenticationError) throw new Error("invalid token");
      return { userId: "user-from-jwt" };
    },
  );
  const execute = vi.fn<WebRestApiExecutor["execute"]>(async (execution) => {
    if (options.error !== undefined) throw options.error;
    if (execution.operation === "OAUTH_CALLBACK") {
      return {
        kind: "redirect",
        location: "https://web.example.com/settings?oauth=success",
      };
    }
    return options.result ?? { kind: "data", data: {} };
  });
  return {
    authenticate,
    execute,
    endpoint: createWebRestApiEndpoint({
      authenticator: { authenticate },
      executor: { execute },
    }),
  };
}

function request(
  method: string,
  path: string,
  body?: unknown,
  authenticated = true,
): Request {
  const rawBody =
    body === undefined
      ? undefined
      : typeof body === "string"
        ? body
        : JSON.stringify(body);
  return new Request(`https://api.example.com${path}`, {
    method,
    headers: {
      ...(authenticated ? { Authorization: "Bearer access-token" } : {}),
      ...(rawBody === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: rawBody,
  });
}
