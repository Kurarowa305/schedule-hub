import { describe, expect, it } from "vitest";
import {
  baseInput,
  createScheduleFixture,
} from "./create-schedule-test-fixture.js";

describe("CreateScheduleServiceの終了時刻補完", () => {
  it("TIMEDのend未指定時はUserPreferenceの所要時間を適用する", async () => {
    const { service, createEvent } = createScheduleFixture();

    const result = await service.execute({
      userId: "user-1",
      input: {
        ...baseInput,
        start: "2026-08-17T10:00:00+09:00",
        end: null,
      },
    });

    expect(result.schedule.end).toBe("2026-08-17T11:00:00+09:00");
    expect(result.appliedDefaults).toEqual(["end"]);
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({ end: "2026-08-17T11:00:00+09:00" }),
      expect.any(Object),
    );
  });
});
