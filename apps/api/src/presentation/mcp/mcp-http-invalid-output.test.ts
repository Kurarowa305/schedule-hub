import { describe, expect, it } from "vitest";
import { createMcpHttpEndpoint } from "./mcp-http-endpoint.js";

describe("MCP ToolのSchema外出力", () => {
  it("内部情報をcontent生成前に拒否し安全なTool Errorへ変換する", async () => {
    const endpoint = createMcpHttpEndpoint({
      authenticator: {
        authenticate: async () => ({
          userId: "user-1",
          token: "mcp-access-token",
          clientId: "claude-client",
          scopes: [],
        }),
      },
      toolExecutor: {
        execute: async () => ({ refreshToken: "refresh-token-secret" }),
      },
    });

    const response = await endpoint.fetch(
      new Request("https://api.example.com/mcp", {
        method: "POST",
        headers: {
          Accept: "application/json, text/event-stream",
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 31,
          method: "tools/call",
          params: { name: "get_schedule_context", arguments: {} },
        }),
      }),
    );
    const body = await response.json();

    expect(body.result).toMatchObject({
      isError: true,
      structuredContent: {
        error: {
          code: "PROVIDER_API_ERROR",
          message: "一時的に予定処理を完了できませんでした。",
          action: "RETRY",
        },
      },
    });
    expect(JSON.stringify(body)).not.toContain("refresh-token-secret");
  });
});
