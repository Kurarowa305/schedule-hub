import { describe, expect, it } from "vitest";
import {
  baseInput,
  createScheduleFixture,
} from "./create-schedule-test-fixture.js";

describe("CreateScheduleServiceの終日予定補完", () => {
  it("ALL_DAYのend未指定時は開始日と同じinclusive終了日にする", async () => {
    const { service, createEvent } = createScheduleFixture();

    const result = await service.execute({
      userId: "user-1",
      input: {
        ...baseInput,
        scheduleType: "ALL_DAY",
        start: "2026-08-17",
        end: null,
      },
    });

    expect(result.schedule.end).toBe("2026-08-17");
    expect(result.appliedDefaults).toEqual(["end"]);
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleType: "ALL_DAY",
        start: "2026-08-17",
        end: "2026-08-17",
      }),
      expect.any(Object),
    );
  });
});
