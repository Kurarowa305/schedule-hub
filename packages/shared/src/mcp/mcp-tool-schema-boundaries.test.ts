import { describe, expect, it } from "vitest";
import {
  validateMcpToolInput,
  validateMcpToolOutput,
} from "./mcp-tool-schema.js";

const validInput = {
  operationId: "op_01J5AR7Y5N3K8M2P6Q9T4VWXZB",
  title: "顧客との定例",
  scheduleType: "TIMED",
  start: "2026-08-17T10:00:00+09:00",
  destinationIds: ["dest_work"],
  destinationInference: {
    type: "EXPLICIT",
    reason: "ユーザーが仕事と明示したため",
  },
};

describe("MCP Tool Schemaの境界値", () => {
  it("create_scheduleのDestination最大50件を受理し51件を拒否する", () => {
    const fiftyIds = Array.from({ length: 50 }, (_, index) => `dest_${index}`);

    expect(
      validateMcpToolInput("create_schedule", {
        ...validInput,
        destinationIds: fiftyIds,
      }),
    ).toEqual({ success: true });
    expect(
      validateMcpToolInput("create_schedule", {
        ...validInput,
        destinationIds: [...fiftyIds, "dest_50"],
      }),
    ).toMatchObject({ success: false });
  });

  it("destinationInference内の追加プロパティを拒否する", () => {
    expect(
      validateMcpToolInput("create_schedule", {
        ...validInput,
        destinationInference: {
          ...validInput.destinationInference,
          destinationId: "dest_work",
        },
      }),
    ).toMatchObject({ success: false });
  });

  it("context出力は空の既定DestinationとDestination一覧を受理する", () => {
    expect(
      validateMcpToolOutput("get_schedule_context", {
        currentDateTime: "2026-08-17T10:00:00+09:00",
        timezone: "Asia/Tokyo",
        defaultDurationMinutes: 60,
        defaultDestinationIds: [],
        destinations: [],
      }),
    ).toEqual({ success: true });
  });

  it("contextのDestination件数・Alias件数・文字数上限を拒否する", () => {
    const destination = {
      id: "dest_work",
      name: "仕事",
      aliases: ["業務"],
      description: "仕事の予定",
    };
    const baseOutput = {
      currentDateTime: "2026-08-17T10:00:00+09:00",
      timezone: "Asia/Tokyo",
      defaultDurationMinutes: 60,
      defaultDestinationIds: ["dest_work"],
      destinations: [destination],
    };
    const invalidOutputs = [
      {
        ...baseOutput,
        destinations: Array.from({ length: 51 }, (_, index) => ({
          ...destination,
          id: `dest_${index}`,
        })),
      },
      {
        ...baseOutput,
        destinations: [{ ...destination, aliases: Array(21).fill("業務") }],
      },
      {
        ...baseOutput,
        destinations: [{ ...destination, aliases: ["あ".repeat(51)] }],
      },
      {
        ...baseOutput,
        destinations: [{ ...destination, description: "あ".repeat(501) }],
      },
      {
        ...baseOutput,
        destinations: [{ ...destination, physicalCalendarId: "pcal-secret" }],
      },
    ];

    for (const output of invalidOutputs) {
      expect(
        validateMcpToolOutput("get_schedule_context", output),
      ).toMatchObject({ success: false });
    }
  });
});
