import { describe, expect, it } from "vitest";
import { CreateScheduleError } from "../errors/create-schedule-error.js";
import {
  baseInput,
  calendar,
  createScheduleFixture,
  destination,
} from "./create-schedule-test-fixture.js";

describe("CreateScheduleServiceの登録先検証", () => {
  it("認証ユーザーに存在しないDestinationを拒否する", async () => {
    const { service, createEvent } = createScheduleFixture({ destinations: [] });

    const error = await service
      .execute({ userId: "user-1", input: baseInput })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(CreateScheduleError);
    expect(error).toMatchObject({ code: "INVALID_DESTINATION" });
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("無効なDestinationを拒否する", async () => {
    const { service, createEvent } = createScheduleFixture({
      destinations: [destination("work", ["pcal-work"], false)],
    });

    const error = await service
      .execute({ userId: "user-1", input: baseInput })
      .catch((cause: unknown) => cause);

    expect(error).toMatchObject({ code: "DESTINATION_DISABLED" });
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("Mapping先Calendarが欠落していれば作成前に拒否する", async () => {
    const { service, createEvent } = createScheduleFixture({
      destinations: [destination("work", ["pcal-a", "pcal-missing"])],
      calendars: [calendar("pcal-a", "conn-google")],
    });

    const error = await service
      .execute({ userId: "user-1", input: baseInput })
      .catch((cause: unknown) => cause);

    expect(error).toMatchObject({ code: "NO_WRITABLE_CALENDAR" });
    expect(createEvent).not.toHaveBeenCalled();
  });
});
