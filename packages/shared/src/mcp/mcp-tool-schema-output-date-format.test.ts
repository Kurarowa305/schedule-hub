import { describe, expect, it } from "vitest";
import { validateMcpToolOutput } from "./mcp-tool-schema.js";

const output = {
  operationId: "op_01J5AR7Y5N3K8M2P6Q9T4VWXZB",
  status: "SUCCESS",
  replayed: false,
  schedule: {
    title: "顧客との定例",
    scheduleType: "TIMED",
    start: "2026-08-17T10:00:00+09:00",
    end: "2026-08-17T11:00:00+09:00",
    timezone: "Asia/Tokyo",
  },
  destinations: [
    {
      id: "dest_work",
      name: "仕事",
      status: "CREATED",
      errorCode: null,
    },
  ],
};

describe("MCP Tool Schemaの出力日時形式", () => {
  it("TIMED出力の日付だけのstart/endを拒否する", () => {
    expect(
      validateMcpToolOutput("create_schedule", {
        ...output,
        schedule: {
          ...output.schedule,
          start: "2026-08-17",
          end: "2026-08-18",
        },
      }),
    ).toMatchObject({ success: false });
  });

  it("ALL_DAY出力のRFC3339日時を拒否する", () => {
    expect(
      validateMcpToolOutput("create_schedule", {
        ...output,
        schedule: {
          ...output.schedule,
          scheduleType: "ALL_DAY",
        },
      }),
    ).toMatchObject({ success: false });
  });
});
