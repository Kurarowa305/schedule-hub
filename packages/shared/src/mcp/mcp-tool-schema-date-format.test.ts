import { describe, expect, it } from "vitest";
import { validateMcpToolInput } from "./mcp-tool-schema.js";

const baseInput = {
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

describe("MCP Tool Schemaの日時形式", () => {
  it("存在しないRFC3339日時を拒否する", () => {
    expect(
      validateMcpToolInput("create_schedule", {
        ...baseInput,
        start: "2026-99-99T99:99:99+09:00",
      }),
    ).toMatchObject({ success: false });
  });

  it("存在しないALL_DAY日付を拒否する", () => {
    expect(
      validateMcpToolInput("create_schedule", {
        ...baseInput,
        scheduleType: "ALL_DAY",
        start: "2026-02-30",
      }),
    ).toMatchObject({ success: false });
  });
});
