import { describe, expect, it } from "vitest";
import { CalendarProviderError } from "../errors/calendar-provider-error.js";
import {
  baseInput,
  calendar,
  connection,
  createScheduleFixture,
  destination,
} from "./create-schedule-test-fixture.js";

describe("CreateScheduleServiceの全失敗", () => {
  it("全CalendarのProvider呼び出し失敗をFAILEDへ集約する", async () => {
    const { service, store } = createScheduleFixture({
      destinations: [
        {
          ...destination("work", ["pcal-a", "pcal-b"]),
          name: "仕事",
        },
      ],
      calendars: [
        calendar("pcal-a", "conn-a"),
        calendar("pcal-b", "conn-b"),
      ],
      connections: [connection("conn-a"), connection("conn-b")],
      createEvent: async () => {
        throw new CalendarProviderError(
          "REQUEST_FAILED",
          "Google API request failed",
        );
      },
    });

    const result = await service.execute({
      userId: "user-1",
      input: baseInput,
    });

    expect(result).toMatchObject({
      status: "FAILED",
      destinations: [
        {
          id: "work",
          name: "仕事",
          status: "FAILED",
          errorCode: "PROVIDER_API_ERROR",
        },
      ],
      warnings: [
        {
          code: "PROVIDER_API_ERROR",
          message: "仕事で予定を作成できませんでした。",
        },
      ],
    });
    expect(store.saveCalendarExecutionResult).toHaveBeenCalledTimes(2);
    expect(store.completeCreateSchedule).toHaveBeenCalledWith(result);
  });
});
