import { describe, expect, it } from "vitest";
import { CalendarProviderError } from "../errors/calendar-provider-error.js";
import {
  baseInput,
  createScheduleFixture,
} from "./create-schedule-test-fixture.js";

describe("CreateScheduleServiceのProvider認証失効", () => {
  it("Connectionを再認証必須にして内部情報を含まない失敗結果を返す", async () => {
    const { service, store } = createScheduleFixture({
      createEvent: async () => {
        throw new CalendarProviderError(
          "AUTH_EXPIRED",
          "refresh token was revoked",
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
          status: "FAILED",
          errorCode: "PROVIDER_AUTH_EXPIRED",
        },
      ],
      warnings: [
        expect.objectContaining({ code: "PROVIDER_AUTH_EXPIRED" }),
      ],
    });
    expect(store.markCalendarConnectionReauthRequired).toHaveBeenCalledWith(
      "user-1",
      "conn-google",
    );
    expect(JSON.stringify(result)).not.toContain("refresh token was revoked");
  });
});
