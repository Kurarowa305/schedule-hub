import { describe, expect, it } from "vitest";
import {
  mcpToolDefinitions,
  validateMcpToolInput,
  validateMcpToolOutput,
} from "../index.js";

describe("MCP Tool Schemaのpackage公開面", () => {
  it("Tool定義とvalidatorをpackage rootから利用できる", () => {
    expect(mcpToolDefinitions.map(({ name }) => name)).toEqual([
      "get_schedule_context",
      "create_schedule",
    ]);
    expect(validateMcpToolInput("get_schedule_context", {})).toEqual({
      success: true,
    });
    expect(
      validateMcpToolOutput("get_schedule_context", {
        error: {
          code: "PROVIDER_API_ERROR",
          message: "一時的に処理できません。",
          action: "RETRY",
        },
      }),
    ).toEqual({ success: true });
  });
});
