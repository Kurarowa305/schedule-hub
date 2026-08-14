import { describe, expect, it } from "vitest";
import { decideOperationExecution } from "./operation-idempotency.js";

const request = {
  operationId: "op_01J5AR7Y5N3K8M2P6Q9T4VWXZB",
  payloadHash: "sha256:payload-a",
  physicalCalendarIds: ["calendar-b", "calendar-a"],
  now: new Date("2026-08-14T09:00:00.000Z"),
  leaseDurationSeconds: 60,
};

describe("CreateOperation実行判定", () => {
  it("既存Operationがなければ全Calendarを対象に開始する", () => {
    expect(decideOperationExecution({ ...request, existing: null })).toEqual({
      kind: "START",
      operationId: request.operationId,
      payloadHash: request.payloadHash,
      leaseExpiresAt: "2026-08-14T09:01:00.000Z",
      retryPhysicalCalendarIds: ["calendar-a", "calendar-b"],
    });
  });
});
