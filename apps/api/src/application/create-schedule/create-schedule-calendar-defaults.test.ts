import { createUserPreference } from "@schedule-hub/shared";
import { expect, it } from "vitest";
import {
  baseInput,
  createScheduleFixture,
} from "./create-schedule-test-fixture.js";

it("UserPreferenceの通知・色・公開範囲をGoogle予定へ適用する", async () => {
  const { service, createEvent } = createScheduleFixture({
    preference: createUserPreference({
      timezone: "Asia/Tokyo",
      defaultDurationMinutes: 60,
      defaultDestinationIds: ["work"],
      defaultReminderMinutes: [10, 30],
      defaultEventColorId: "5",
      defaultVisibility: "private",
    }),
  });

  await service.execute({ userId: "user-1", input: baseInput });

  expect(createEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      eventColorId: "5",
      visibility: "private",
      reminders: {
        useDefault: false,
        overrides: [
          { method: "popup", minutes: 10 },
          { method: "popup", minutes: 30 },
        ],
      },
    }),
    expect.any(Object),
  );
});
