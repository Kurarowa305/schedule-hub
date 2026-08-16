import { describe, expect, it } from "vitest";
import { validateMcpToolOutput } from "./mcp-tool-schema.js";

describe("MCP Tool SchemaのOperation処理中エラー", () => {
  it("SH-032が返すOPERATION_IN_PROGRESSを構造化Tool Errorとして受理する", () => {
    expect(
      validateMcpToolOutput("create_schedule", {
        error: {
          code: "OPERATION_IN_PROGRESS",
          message: "同じ予定の作成処理が進行中です。",
          action: "RETRY",
        },
      }),
    ).toEqual({ success: true });
  });
});
