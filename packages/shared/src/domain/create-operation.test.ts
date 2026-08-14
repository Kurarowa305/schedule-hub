import { describe, expect, it } from "vitest";
import {
  createCreateOperation,
  createExternalEvent,
} from "./create-operation.js";

const validOperation = {
  operationId: "op_01J5AR7Y5N3K8M2P6Q9T4VWXZB",
  userId: "user-1",
  title: "顧客との定例",
  scheduleType: "TIMED" as const,
  start: "2026-08-14T10:00:00+09:00",
  end: "2026-08-14T11:00:00+09:00",
  timezone: "Asia/Tokyo",
  destinationIds: ["work"],
  status: "PROCESSING" as const,
  eventHash: "sha256:example",
};

describe("Create Operation", () => {
  it("終了日時が開始日時以前のOperationは生成できない", () => {
    expect(() =>
      createCreateOperation({
        ...validOperation,
        end: validOperation.start,
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_EVENT_PERIOD" }));
  });

  it("重複したDestinationを持つOperationは生成できない", () => {
    expect(() =>
      createCreateOperation({
        ...validOperation,
        destinationIds: ["work", "work"],
      }),
    ).toThrowError(
      expect.objectContaining({ code: "DUPLICATE_DESTINATION_ID" }),
    );
  });
});

describe("External Event", () => {
  it("成功結果にはexternalEventIdが必要", () => {
    expect(() =>
      createExternalEvent({
        physicalCalendarId: "calendar-work",
        provider: "GOOGLE",
        status: "SUCCESS",
        externalEventId: null,
        errorCode: null,
      }),
    ).toThrowError(
      expect.objectContaining({ code: "SUCCESS_EVENT_REQUIRES_ID" }),
    );
  });

  it("失敗結果にはerrorCodeが必要", () => {
    expect(() =>
      createExternalEvent({
        physicalCalendarId: "calendar-work",
        provider: "GOOGLE",
        status: "FAILED",
        externalEventId: null,
        errorCode: null,
      }),
    ).toThrowError(
      expect.objectContaining({ code: "FAILED_EVENT_REQUIRES_CODE" }),
    );
  });
});
