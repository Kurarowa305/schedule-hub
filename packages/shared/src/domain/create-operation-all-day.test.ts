import { describe, expect, it } from "vitest";
import { createCreateOperation } from "./create-operation.js";

describe("CreateOperationのALL_DAY期間", () => {
  it("ユーザー視点の同日inclusive終了日を許可する", () => {
    expect(
      createCreateOperation({
        operationId: "op_01J5AR7Y5N3K8M2P6Q9T4VWXZB",
        userId: "user-1",
        title: "休暇",
        scheduleType: "ALL_DAY",
        start: "2026-08-17",
        end: "2026-08-17",
        timezone: "Asia/Tokyo",
        destinationIds: ["private"],
        status: "PROCESSING",
        eventHash: "sha256:payload",
      }),
    ).toMatchObject({ start: "2026-08-17", end: "2026-08-17" });
  });
});
