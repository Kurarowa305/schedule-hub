import { describe, expect, it, vi } from "vitest";
import {
  createMcpHttpEndpoint,
  McpAuthenticationError,
  type McpRequestAuthenticator,
  type McpToolExecutor,
} from "./mcp-http-endpoint.js";

describe("MCP Streamable HTTP Endpointのエラー境界", () => {
  it("Tool Input Schema違反はexecutorを呼ばずTool Errorを返す", async () => {
    const { endpoint, execute } = fixture();

    const response = await endpoint.fetch(
      request({
        jsonrpc: "2.0",
        id: 10,
        method: "tools/call",
        params: {
          name: "create_schedule",
          arguments: {
            operationId: "op_invalid",
            title: "定例",
            scheduleType: "TIMED",
            start: "2026-08-17T10:00:00+09:00",
            destinationIds: ["dest_work"],
            destinationInference: { type: "EXPLICIT", reason: "明示" },
          },
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      jsonrpc: "2.0",
      id: 10,
      result: { isError: true },
    });
    expect(body.error).toBeUndefined();
    expect(execute).not.toHaveBeenCalled();
  });

  it("未知JSON-RPC methodはMethod Not Foundを返す", async () => {
    const { endpoint, execute } = fixture();

    const response = await endpoint.fetch(
      request({ jsonrpc: "2.0", id: 11, method: "unknown/method" }),
    );
    const body = await response.json();

    expect(body).toMatchObject({
      jsonrpc: "2.0",
      id: 11,
      error: { code: -32601 },
    });
    expect(body.result).toBeUndefined();
    expect(execute).not.toHaveBeenCalled();
  });

  it("認証失敗はJSON-RPC処理前にHTTP 401とBearer challengeを返す", async () => {
    const { endpoint, execute } = fixture({
      authenticate: async () => {
        throw new McpAuthenticationError();
      },
    });

    const response = await endpoint.fetch(
      request({ jsonrpc: "2.0", id: 12, method: "tools/list", params: {} }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(body).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "MCP Access Tokenを確認してください",
      },
    });
    expect(execute).not.toHaveBeenCalled();
  });
});

function fixture(
  options: {
    readonly authenticate?: McpRequestAuthenticator["authenticate"];
  } = {},
) {
  const authenticate = vi.fn<McpRequestAuthenticator["authenticate"]>(
    options.authenticate ??
      (async () => ({
        userId: "user-1",
        token: "mcp-access-token",
        clientId: "claude-client",
        scopes: [],
      })),
  );
  const execute = vi.fn<McpToolExecutor["execute"]>(async () => ({}));
  return {
    execute,
    endpoint: createMcpHttpEndpoint({
      authenticator: { authenticate },
      toolExecutor: { execute },
    }),
  };
}

function request(body: unknown): Request {
  return new Request("https://api.example.com/mcp", {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": "2025-06-18",
    },
    body: JSON.stringify(body),
  });
}
