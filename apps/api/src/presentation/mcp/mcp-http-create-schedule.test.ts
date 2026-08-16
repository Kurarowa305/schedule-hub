import {
  createScheduleOutputSchema,
  getScheduleContextOutputSchema,
} from "@schedule-hub/shared";
import { describe, expect, it, vi } from "vitest";
import {
  createMcpHttpEndpoint,
  type McpToolExecutor,
} from "./mcp-http-endpoint.js";

const input = {
  operationId: "op_01J5AR7Y5N3K8M2P6Q9T4VWXZB",
  title: "顧客との定例",
  scheduleType: "TIMED",
  start: "2026-08-17T10:00:00+09:00",
  end: null,
  destinationIds: ["dest_work"],
  destinationInference: {
    type: "EXPLICIT",
    reason: "ユーザーが仕事と明示したため",
  },
};

const output = {
  operationId: input.operationId,
  status: "SUCCESS",
  replayed: false,
  schedule: {
    title: input.title,
    scheduleType: "TIMED",
    start: input.start,
    end: "2026-08-17T11:00:00+09:00",
    timezone: "Asia/Tokyo",
  },
  appliedDefaults: ["end"],
  destinations: [
    {
      id: "dest_work",
      name: "仕事",
      status: "CREATED",
      errorCode: null,
    },
  ],
  warnings: [],
};

describe("MCP create_schedule Tool", () => {
  it("tools/listで両Toolの正式Output Schemaを公開する", async () => {
    const { endpoint } = fixture();

    const response = await endpoint.fetch(
      request({ jsonrpc: "2.0", id: 20, method: "tools/list", params: {} }),
    );
    const body = await response.json();

    expect(body.result.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "get_schedule_context",
          outputSchema: getScheduleContextOutputSchema,
        }),
        expect.objectContaining({
          name: "create_schedule",
          outputSchema: createScheduleOutputSchema,
        }),
      ]),
    );
  });

  it("create_scheduleの入力と認証userIdをexecutorへ渡す", async () => {
    const { endpoint, execute } = fixture();

    const response = await endpoint.fetch(
      request({
        jsonrpc: "2.0",
        id: 21,
        method: "tools/call",
        params: { name: "create_schedule", arguments: input },
      }),
    );
    const body = await response.json();

    expect(execute).toHaveBeenCalledWith({
      userId: "user-1",
      toolName: "create_schedule",
      input,
    });
    expect(body.result).toMatchObject({
      isError: false,
      structuredContent: output,
    });
  });
});

function fixture() {
  const execute = vi.fn<McpToolExecutor["execute"]>(async () => output);
  return {
    execute,
    endpoint: createMcpHttpEndpoint({
      authenticator: {
        authenticate: async () => ({
          userId: "user-1",
          token: "mcp-access-token",
          clientId: "claude-client",
          scopes: ["schedule/write"],
        }),
      },
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
