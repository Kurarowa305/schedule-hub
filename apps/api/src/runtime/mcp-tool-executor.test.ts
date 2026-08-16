import { describe, expect, it, vi } from "vitest";
import { createMcpToolExecutor } from "./mcp-tool-executor.js";

describe("MCP Tool本番委譲", () => {
  it("get_schedule_contextを認証ユーザーのServiceへ委譲する", async () => {
    const get = vi.fn(async () => ({ timezone: "Asia/Tokyo" }));
    const execute = vi.fn();
    const executor = createMcpToolExecutor({
      getScheduleContext: { get },
      createSchedule: { execute },
    });

    await expect(
      executor.execute({
        userId: "user-1",
        toolName: "get_schedule_context",
        input: {},
      }),
    ).resolves.toEqual({ timezone: "Asia/Tokyo" });
    expect(get).toHaveBeenCalledWith("user-1");
  });

  it("create_scheduleへuserIdと入力を分離して委譲する", async () => {
    const result = { operationId: "op-1", status: "SUCCESS" };
    const execute = vi.fn(async () => result);
    const executor = createMcpToolExecutor({
      getScheduleContext: { get: vi.fn() },
      createSchedule: { execute },
    });
    const input = {
      operationId: "op-1",
      title: "定例",
      scheduleType: "TIMED",
      start: "2026-08-17T10:00:00+09:00",
      end: "2026-08-17T11:00:00+09:00",
      destinationIds: ["work"],
      destinationInference: { type: "EXPLICIT", reason: "仕事と指定" },
    };

    await expect(
      executor.execute({ userId: "user-1", toolName: "create_schedule", input }),
    ).resolves.toBe(result);
    expect(execute).toHaveBeenCalledWith({ userId: "user-1", input });
  });
});
