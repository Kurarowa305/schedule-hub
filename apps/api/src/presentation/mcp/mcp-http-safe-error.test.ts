import { describe, expect, it } from "vitest";
import { createMcpHttpEndpoint } from "./mcp-http-endpoint.js";

describe("MCP Toolの予期しないエラー", () => {
  it("内部エラー文やTokenを公開せず再試行可能なTool Errorへ変換する", async () => {
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
        execute: async () => {
          throw new Error("refresh-token-secretを保存できませんでした");
        },
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
          id: 30,
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
