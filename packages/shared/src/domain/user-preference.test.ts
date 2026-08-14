import { describe, expect, it } from "vitest";
import {
  DomainValidationError,
  createUserPreference,
} from "./user-preference.js";

describe("UserPreference", () => {
  it.each([0, 1441, 1.5])(
    "defaultDurationMinutes=%sでは生成できない",
    (defaultDurationMinutes) => {
      expect(() =>
        createUserPreference({
          timezone: "Asia/Tokyo",
          defaultDurationMinutes,
          defaultDestinationIds: ["private"],
        }),
      ).toThrowError(
        new DomainValidationError(
          "INVALID_DEFAULT_DURATION",
          "defaultDurationMinutesは1から1440の整数で指定してください",
        ),
      );
    },
  );

  it("正しい設定を正規化して生成できる", () => {
    expect(
      createUserPreference({
        timezone: "Asia/Tokyo",
        defaultDurationMinutes: 60,
        defaultDestinationIds: [" private ", "work"],
      }),
    ).toEqual({
      timezone: "Asia/Tokyo",
      defaultDurationMinutes: 60,
      defaultDestinationIds: ["private", "work"],
    });
  });
});
