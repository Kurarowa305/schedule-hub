import { CalendarProviderError } from "../errors/calendar-provider-error.js";
import { CreateScheduleError } from "../errors/create-schedule-error.js";
import { describe, expect, it } from "vitest";
import type { CreateScheduleResult } from "./create-schedule-contract.js";
import {
  baseInput,
  calendar,
  connection,
  createScheduleFixture,
  destination,
} from "./create-schedule-test-fixture.js";

const replayResult: CreateScheduleResult = {
  operationId: baseInput.operationId,
  status: "SUCCESS",
  replayed: false,
  schedule: {
    title: baseInput.title,
    scheduleType: "TIMED",
    start: baseInput.start,
    end: baseInput.end ?? "",
    timezone: "Asia/Tokyo",
  },
  appliedDefaults: [],
  destinations: [
    {
      id: "work",
      name: "登録先work",
      status: "CREATED",
      errorCode: null,
    },
  ],
  warnings: [],
};

describe("CreateScheduleServiceの冪等再送", () => {
  it("完了済み同一OperationはProviderを呼ばず既存結果をreplayする", async () => {
    const { service, createEvent } = createScheduleFixture({
      beginResult: { kind: "REPLAY", result: replayResult },
    });

    await expect(
      service.execute({ userId: "user-1", input: baseInput }),
    ).resolves.toEqual({ ...replayResult, replayed: true });
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("異なるPayloadで同じoperationIdを使うと競合を返す", async () => {
    const { service, createEvent } = createScheduleFixture({
      beginResult: { kind: "CONFLICT" },
    });

    const error = await service
      .execute({ userId: "user-1", input: baseInput })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(CreateScheduleError);
    expect(error).toMatchObject({ code: "OPERATION_ID_CONFLICT" });
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("既存成功Calendarを除外し、失敗Calendarだけ再試行して再集約する", async () => {
    const { service, createEvent } = createScheduleFixture({
      destinations: [destination("work", ["pcal-a", "pcal-b"])],
      calendars: [
        calendar("pcal-a", "conn-a"),
        calendar("pcal-b", "conn-b"),
      ],
      connections: [connection("conn-a"), connection("conn-b")],
      beginResult: {
        kind: "EXECUTE",
        physicalCalendarIds: ["pcal-b"],
        existingResults: [
          {
            operationId: baseInput.operationId,
            physicalCalendarId: "pcal-a",
            provider: "GOOGLE",
            status: "SUCCESS",
            externalEventId: "event-a",
            errorCode: null,
          },
        ],
      },
      createEvent: async () => {
        throw new CalendarProviderError("REQUEST_FAILED", "temporary error");
      },
    });

    const result = await service.execute({
      userId: "user-1",
      input: baseInput,
    });

    expect(createEvent).toHaveBeenCalledOnce();
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({ physicalCalendarId: "pcal-b" }),
      expect.any(Object),
    );
    expect(result.status).toBe("PARTIAL_SUCCESS");
    expect(result.destinations[0]).toMatchObject({
      status: "PARTIAL_SUCCESS",
      errorCode: "PROVIDER_API_ERROR",
    });
  });
});
