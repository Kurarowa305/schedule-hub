import { describe, expect, it } from "vitest";
import { CreateScheduleError } from "../errors/create-schedule-error.js";
import {
  baseInput,
  createScheduleFixture,
} from "./create-schedule-test-fixture.js";

describe("CreateScheduleServiceの日時検証", () => {
  it("TIMEDの終了日時が開始日時以前ならINVALID_DATETIMEを返す", async () => {
    const { service, createEvent } = createScheduleFixture();

    const error = await service
      .execute({
        userId: "user-1",
        input: {
          ...baseInput,
          end: baseInput.start,
        },
      })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(CreateScheduleError);
    expect(error).toMatchObject({ code: "INVALID_DATETIME" });
    expect(createEvent).not.toHaveBeenCalled();
  });
});
