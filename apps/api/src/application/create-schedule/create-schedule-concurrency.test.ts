import { describe, expect, it } from "vitest";
import {
  baseInput,
  calendar,
  connection,
  createScheduleFixture,
  destination,
} from "./create-schedule-test-fixture.js";

describe("CreateScheduleServiceの複数Calendar制御", () => {
  it("重複Mappingを排除してProvider同時実行数を20以下にする", async () => {
    const physicalCalendarIds = Array.from(
      { length: 25 },
      (_, index) => `pcal-${index.toString().padStart(2, "0")}`,
    );
    let active = 0;
    let maxActive = 0;
    const { service, createEvent } = createScheduleFixture({
      destinations: [
        destination("work", physicalCalendarIds),
        destination("private", [physicalCalendarIds[0] ?? ""]),
      ],
      calendars: physicalCalendarIds.map((id) => calendar(id, `conn-${id}`)),
      connections: physicalCalendarIds.map((id) => connection(`conn-${id}`)),
      createEvent: async (input) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active -= 1;
        return {
          externalEventId: `event-${input.physicalCalendarId}`,
          credentialUpdate: null,
        };
      },
    });

    const result = await service.execute({
      userId: "user-1",
      input: {
        ...baseInput,
        destinationIds: ["work", "private"],
      },
    });

    expect(createEvent).toHaveBeenCalledTimes(25);
    expect(
      new Set(
        createEvent.mock.calls.map(
          ([input]) => input.physicalCalendarId,
        ),
      ).size,
    ).toBe(25);
    expect(maxActive).toBeLessThanOrEqual(20);
    expect(result.status).toBe("SUCCESS");
    expect(result.destinations.map(({ status }) => status)).toEqual([
      "CREATED",
      "CREATED",
    ]);
  });
});
