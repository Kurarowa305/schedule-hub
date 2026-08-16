import { CalendarProviderError } from "../errors/calendar-provider-error.js";
import { describe, expect, it } from "vitest";
import {
  baseInput,
  calendar,
  connection,
  createScheduleFixture,
  destination,
} from "./create-schedule-test-fixture.js";

describe("CreateScheduleServiceの部分成功", () => {
  it("同じDestinationの一部Calendar失敗をPARTIAL_SUCCESSへ集約する", async () => {
    const { service, store } = createScheduleFixture({
      destinations: [destination("work", ["pcal-a", "pcal-b"])],
      calendars: [
        calendar("pcal-a", "conn-a"),
        calendar("pcal-b", "conn-b"),
      ],
      connections: [connection("conn-a"), connection("conn-b")],
      createEvent: async (input) => {
        if (input.physicalCalendarId === "pcal-b") {
          throw new CalendarProviderError(
            "REQUEST_FAILED",
            "Google API request failed",
          );
        }
        return {
          externalEventId: "event-a",
          credentialUpdate: null,
        };
      },
    });

    const result = await service.execute({
      userId: "user-1",
      input: baseInput,
    });

    expect(result).toMatchObject({
      status: "PARTIAL_SUCCESS",
      destinations: [
        {
          id: "work",
          status: "PARTIAL_SUCCESS",
          errorCode: "PROVIDER_API_ERROR",
        },
      ],
      warnings: [
        {
          code: "PROVIDER_API_ERROR",
          message: "登録先workの一部で予定を作成できませんでした。",
        },
      ],
    });
    expect(store.saveCalendarExecutionResult).toHaveBeenCalledWith({
      operationId: baseInput.operationId,
      physicalCalendarId: "pcal-b",
      provider: "GOOGLE",
      status: "FAILED",
      externalEventId: null,
      errorCode: "PROVIDER_API_ERROR",
    });
  });
});
