import { describe, expect, it } from "vitest";
import { decideOperationExecution } from "./operation-idempotency.js";

const baseRequest = {
  operationId: "op_01J5AR7Y5N3K8M2P6Q9T4VWXZB",
  payloadHash: "sha256:payload-a",
  physicalCalendarIds: ["calendar-a", "calendar-b"],
  now: new Date("2026-08-14T09:00:00.000Z"),
  leaseDurationSeconds: 60,
};

describe("CreateOperation Leaseと再試行", () => {
  it("有効なLeaseを持つPROCESSINGは処理中として返す", () => {
    expect(
      decideOperationExecution({
        ...baseRequest,
        existing: {
          operationId: baseRequest.operationId,
          payloadHash: baseRequest.payloadHash,
          status: "PROCESSING",
          leaseExpiresAt: "2026-08-14T09:01:00.000Z",
          results: [],
        },
      }),
    ).toEqual({
      kind: "IN_PROGRESS",
      leaseExpiresAt: "2026-08-14T09:01:00.000Z",
    });
  });

  it("期限切れPROCESSINGは成功していないCalendarだけを再開する", () => {
    expect(
      decideOperationExecution({
        ...baseRequest,
        now: new Date("2026-08-14T09:02:00.000Z"),
        existing: {
          operationId: baseRequest.operationId,
          payloadHash: baseRequest.payloadHash,
          status: "PROCESSING",
          leaseExpiresAt: "2026-08-14T09:01:00.000Z",
          results: [{ physicalCalendarId: "calendar-a", status: "SUCCESS" }],
        },
      }),
    ).toEqual({
      kind: "RESUME",
      leaseExpiresAt: "2026-08-14T09:03:00.000Z",
      retryPhysicalCalendarIds: ["calendar-b"],
    });
  });

  it("部分成功は失敗したCalendarだけを再試行する", () => {
    expect(
      decideOperationExecution({
        ...baseRequest,
        existing: {
          operationId: baseRequest.operationId,
          payloadHash: baseRequest.payloadHash,
          status: "PARTIAL_SUCCESS",
          leaseExpiresAt: null,
          results: [
            { physicalCalendarId: "calendar-a", status: "SUCCESS" },
            { physicalCalendarId: "calendar-b", status: "FAILED" },
          ],
        },
      }),
    ).toEqual({
      kind: "RETRY",
      leaseExpiresAt: "2026-08-14T09:01:00.000Z",
      retryPhysicalCalendarIds: ["calendar-b"],
    });
  });
});
