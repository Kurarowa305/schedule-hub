import { describe, expect, it } from "vitest";
import {
  DomainValidationError,
  createUserPreference,
} from "./user-preference.js";

describe("UserPreferenceのCalendar既定値", () => {
  it("通知・予定色・公開範囲を正規化して保持する", () => {
    expect(
      createUserPreference({
        timezone: "Asia/Tokyo",
        defaultDurationMinutes: 60,
        defaultDestinationIds: ["work"],
        defaultReminderMinutes: [30, 10, 30],
        defaultEventColorId: "5",
        defaultVisibility: "private",
      }),
    ).toEqual({
      timezone: "Asia/Tokyo",
      defaultDurationMinutes: 60,
      defaultDestinationIds: ["work"],
      defaultReminderMinutes: [10, 30],
      defaultEventColorId: "5",
      defaultVisibility: "private",
    });
  });

  it.each([[-1], [40321], [10.5]])("不正な通知分数%jを拒否する", (minutes) => {
    expect(() =>
      createUserPreference({
        timezone: "Asia/Tokyo",
        defaultDurationMinutes: 60,
        defaultDestinationIds: [],
        defaultReminderMinutes: [minutes],
      }),
    ).toThrow(DomainValidationError);
  });
});
