import { describe, expect, it } from "vitest";
import { decideOperationExecution } from "./operation-idempotency.js";

const request = {
  operationId: "op_01J5AR7Y5N3K8M2P6Q9T4VWXZB",
  payloadHash: "sha256:payload-a",
  physicalCalendarIds: ["calendar-a", "calendar-b"],
  now: new Date("2026-08-14T09:00:00.000Z"),
  leaseDurationSeconds: 60,
};

describe("CreateOperation再送判定", () => {
  it("同一payloadの完了済みOperationは既存結果を返す", () => {
    expect(
      decideOperationExecution({
        ...request,
        existing: {
          operationId: request.operationId,
          payloadHash: request.payloadHash,
          status: "SUCCESS",
          leaseExpiresAt: null,
          results: [
            { physicalCalendarId: "calendar-a", status: "SUCCESS" },
            { physicalCalendarId: "calendar-b", status: "SUCCESS" },
          ],
        },
      }),
    ).toEqual({
      kind: "REPLAY",
      status: "SUCCESS",
      results: [
        { physicalCalendarId: "calendar-a", status: "SUCCESS" },
        { physicalCalendarId: "calendar-b", status: "SUCCESS" },
      ],
    });
  });

  it("同じoperationIdを異なるpayloadに再利用できない", () => {
    expect(() =>
      decideOperationExecution({
        ...request,
        existing: {
          operationId: request.operationId,
          payloadHash: "sha256:different-payload",
          status: "SUCCESS",
          leaseExpiresAt: null,
          results: [],
        },
      }),
    ).toThrowError(expect.objectContaining({ code: "OPERATION_ID_CONFLICT" }));
  });
});
