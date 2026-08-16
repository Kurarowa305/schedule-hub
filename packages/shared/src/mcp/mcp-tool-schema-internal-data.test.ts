import { describe, expect, it } from "vitest";
import { validateMcpToolOutput } from "./mcp-tool-schema.js";

const validOutput = {
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

describe("MCP Tool Schemaの内部情報遮断", () => {
  it.each([
    ["physicalCalendarId", "pcal-secret"],
    ["externalCalendarId", "calendar@example.com"],
    ["connectionId", "conn-secret"],
    ["accessToken", "access-secret"],
    ["refreshToken", "refresh-secret"],
  ])("create_schedule出力の%sを拒否する", (field, value) => {
    expect(
      validateMcpToolOutput("create_schedule", {
        ...validOutput,
        [field]: value,
      }),
    ).toMatchObject({ success: false });
  });
});
