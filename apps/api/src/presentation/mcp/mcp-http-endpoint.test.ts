import {
  createScheduleInputSchema,
  getScheduleContextInputSchema,
} from "@schedule-hub/shared";
import { describe, expect, it, vi } from "vitest";
import { CreateScheduleError } from "../../application/errors/create-schedule-error.js";
import {
  createMcpHttpEndpoint,
  type McpRequestAuthenticator,
  type McpToolExecutor,
} from "./mcp-http-endpoint.js";

const authentication = {
  userId: "user-1",
  token: "mcp-access-token",
  clientId: "claude-client",
  scopes: ["schedule/read", "schedule/write"],
};

const contextOutput = {
  currentDateTime: "2026-08-17T10:00:00+09:00",
  timezone: "Asia/Tokyo",
  defaultDurationMinutes: 60,
  defaultDestinationIds: ["dest_work"],
  destinations: [
    {
      id: "dest_work",
      name: "仕事",
      aliases: ["業務"],
      description: "仕事の予定",
    },
  ],
};

describe("MCP Streamable HTTP Endpoint", () => {
  it("initializeでtools capabilityを返しSession IDを発行しない", async () => {
    const { endpoint } = fixture();

    const response = await endpoint.fetch(
      mcpRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      }),
    );
    const body = await jsonBody(response);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.has("mcp-session-id")).toBe(false);
    expect(body).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "schedule-hub", version: "0.1.0" },
      },
    });
  });

  it("tools/listでSH-030と同じ2つのTool Schemaを返す", async () => {
    const { endpoint } = fixture();

    const response = await endpoint.fetch(
      mcpRequest(
        { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
        { "MCP-Protocol-Version": "2025-06-18" },
      ),
    );
    const body = await jsonBody(response);

    expect(body.result.tools).toHaveLength(2);
    expect(body.result.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "get_schedule_context",
          inputSchema: getScheduleContextInputSchema,
        }),
        expect.objectContaining({
          name: "create_schedule",
          inputSchema: createScheduleInputSchema,
        }),
      ]),
    );
  });

  it("tools/callへ認証userIdを渡しstructuredContentを返す", async () => {
    const { endpoint, execute } = fixture();

    const response = await endpoint.fetch(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "get_schedule_context", arguments: {} },
        },
        { "MCP-Protocol-Version": "2025-06-18" },
      ),
    );
    const body = await jsonBody(response);

    expect(execute).toHaveBeenCalledWith({
      userId: "user-1",
      toolName: "get_schedule_context",
      input: {},
    });
    expect(body.result).toMatchObject({
      isError: false,
      structuredContent: contextOutput,
    });
  });

  it("業務エラーをJSON-RPC errorではなくTool Errorとして返す", async () => {
    const { endpoint } = fixture({
      execute: async () => {
        throw new CreateScheduleError(
          "INVALID_DESTINATION",
          "選択された登録先は現在利用できません。",
        );
      },
    });

    const response = await endpoint.fetch(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: { name: "get_schedule_context", arguments: {} },
        },
        { "MCP-Protocol-Version": "2025-06-18" },
      ),
    );
    const body = await jsonBody(response);

    expect(body.error).toBeUndefined();
    expect(body.result).toMatchObject({
      isError: true,
      structuredContent: {
        error: {
          code: "INVALID_DESTINATION",
          message: "選択された登録先は現在利用できません。",
          action: "REFETCH_SCHEDULE_CONTEXT",
        },
      },
    });
  });

  it("不正JSONをTool ErrorではなくJSON-RPC Parse Errorとして返す", async () => {
    const { endpoint, execute } = fixture();

    const response = await endpoint.fetch(mcpRequest("{"));
    const body = await jsonBody(response);

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700 },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("GET /mcpを405で拒否しSession IDを返さない", async () => {
    const { endpoint, authenticate } = fixture();

    const response = await endpoint.fetch(
      new Request("https://api.example.com/mcp", { method: "GET" }),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(response.headers.has("mcp-session-id")).toBe(false);
    expect(authenticate).not.toHaveBeenCalled();
  });
});

function fixture(
  options: { readonly execute?: McpToolExecutor["execute"] } = {},
) {
  const authenticate = vi.fn<McpRequestAuthenticator["authenticate"]>(
    async () => authentication,
  );
  const execute = vi.fn<McpToolExecutor["execute"]>(
    options.execute ?? (async () => contextOutput),
  );
  return {
    authenticate,
    execute,
    endpoint: createMcpHttpEndpoint({
      authenticator: { authenticate },
      toolExecutor: { execute },
    }),
  };
}

function mcpRequest(
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
): Request {
  return new Request("https://api.example.com/mcp", {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

interface TestJsonRpcResponse {
  readonly jsonrpc: string;
  readonly id: number | null;
  readonly result: {
    readonly tools: readonly unknown[];
    readonly isError: boolean;
    readonly structuredContent: unknown;
    readonly [key: string]: unknown;
  };
  readonly error?: {
    readonly code: number;
    readonly [key: string]: unknown;
  };
}

async function jsonBody(response: Response): Promise<TestJsonRpcResponse> {
  return (await response.json()) as TestJsonRpcResponse;
}
