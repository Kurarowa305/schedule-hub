import { describe, expect, it } from "vitest";
import {
  createScheduleInputSchema,
  createScheduleOutputSchema,
  getScheduleContextInputSchema,
  getScheduleContextOutputSchema,
  mcpToolDefinitions,
  validateMcpToolInput,
  validateMcpToolOutput,
} from "./mcp-tool-schema.js";

const validCreateInput = {
  operationId: "op_01J5AR7Y5N3K8M2P6Q9T4VWXZB",
  title: "顧客との定例",
  scheduleType: "TIMED",
  start: "2026-08-17T10:00:00+09:00",
  end: null,
  destinationIds: ["dest_work"],
  location: null,
  description: null,
  assumptions: ["終了時刻は既定値を使用"],
  sourceText: "明日10時から顧客との定例",
  destinationInference: {
    type: "SEMANTIC_INFERENCE",
    reason: "顧客との定例は仕事の用途に一致するため",
  },
};

describe("MCP Tool Schema", () => {
  it("Tool定義とvalidatorが同じInput/Output Schemaを参照する", () => {
    expect(mcpToolDefinitions).toHaveLength(2);
    expect(mcpToolDefinitions[0]).toMatchObject({
      name: "get_schedule_context",
      inputSchema: getScheduleContextInputSchema,
      outputSchema: getScheduleContextOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    });
    expect(mcpToolDefinitions[1]).toMatchObject({
      name: "create_schedule",
      inputSchema: createScheduleInputSchema,
      outputSchema: createScheduleOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    });
    expect(validateMcpToolInput("create_schedule", validCreateInput)).toEqual({
      success: true,
    });
  });

  it.each([
    ["operationId", { ...validCreateInput, operationId: "op_invalid" }],
    ["title", { ...validCreateInput, title: "" }],
    [
      "destinationIds",
      { ...validCreateInput, destinationIds: ["dest_work", "dest_work"] },
    ],
    ["additionalProperties", { ...validCreateInput, timezone: "Asia/Tokyo" }],
  ])("create_schedule入力の%s違反を拒否する", (_caseName, input) => {
    expect(validateMcpToolInput("create_schedule", input)).toMatchObject({
      success: false,
    });
  });

  it("create_scheduleの文字数・配列件数上限を拒否する", () => {
    const invalidInputs = [
      { ...validCreateInput, title: "あ".repeat(201) },
      { ...validCreateInput, location: "あ".repeat(501) },
      { ...validCreateInput, description: "あ".repeat(5001) },
      { ...validCreateInput, assumptions: Array(21).fill("仮定") },
      { ...validCreateInput, assumptions: ["あ".repeat(501)] },
      { ...validCreateInput, sourceText: "あ".repeat(2001) },
      {
        ...validCreateInput,
        destinationInference: {
          ...validCreateInput.destinationInference,
          reason: "あ".repeat(501),
        },
      },
    ];

    for (const input of invalidInputs) {
      expect(validateMcpToolInput("create_schedule", input)).toMatchObject({
        success: false,
      });
    }
  });

  it("TIMEDとALL_DAYでstart/end形式を分ける", () => {
    expect(
      validateMcpToolInput("create_schedule", {
        ...validCreateInput,
        scheduleType: "ALL_DAY",
        start: "2026-08-17",
        end: "2026-08-19",
      }),
    ).toEqual({ success: true });
    expect(
      validateMcpToolInput("create_schedule", {
        ...validCreateInput,
        scheduleType: "ALL_DAY",
        start: "2026-08-17T10:00:00+09:00",
      }),
    ).toMatchObject({ success: false });
    expect(
      validateMcpToolInput("create_schedule", {
        ...validCreateInput,
        start: "2026-08-17",
      }),
    ).toMatchObject({ success: false });
  });

  it("get_schedule_contextの空入力以外と不正な出力を拒否する", () => {
    expect(validateMcpToolInput("get_schedule_context", {})).toEqual({
      success: true,
    });
    expect(
      validateMcpToolInput("get_schedule_context", { userId: "user-1" }),
    ).toMatchObject({ success: false });
    expect(
      validateMcpToolOutput("get_schedule_context", {
        currentDateTime: "2026-08-17T10:00:00+09:00",
        timezone: "Asia/Tokyo",
        defaultDurationMinutes: 0,
        defaultDestinationIds: [],
        destinations: [],
      }),
    ).toMatchObject({ success: false });
  });

  it("create_scheduleの大文字status出力と構造化Tool Errorを受理する", () => {
    expect(
      validateMcpToolOutput("create_schedule", {
        operationId: validCreateInput.operationId,
        status: "SUCCESS",
        replayed: false,
        schedule: {
          title: validCreateInput.title,
          scheduleType: "TIMED",
          start: validCreateInput.start,
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
      }),
    ).toEqual({ success: true });
    expect(
      validateMcpToolOutput("create_schedule", {
        error: {
          code: "INVALID_DESTINATION",
          message: "選択された登録先は現在利用できません。",
          action: "REFETCH_SCHEDULE_CONTEXT",
        },
      }),
    ).toEqual({ success: true });
    expect(
      validateMcpToolOutput("create_schedule", {
        operationId: validCreateInput.operationId,
        status: "created",
      }),
    ).toMatchObject({ success: false });
  });
});
