import { afterAll, beforeAll, expect, it } from "vitest";
import { createUserPreference } from "@schedule-hub/shared";
import {
  createDynamoDbTestContext,
  type DynamoDbTestContext,
} from "./dynamodb-test-harness.js";

let context: DynamoDbTestContext;

beforeAll(async () => {
  context = await createDynamoDbTestContext();
});

afterAll(async () => {
  await context.close();
});

it("通知・予定色・公開範囲をUserPreferenceと一緒に永続化する", async () => {
  const preference = createUserPreference({
    timezone: "Asia/Tokyo",
    defaultDurationMinutes: 90,
    defaultDestinationIds: ["work"],
    defaultReminderMinutes: [10, 30],
    defaultEventColorId: "5",
    defaultVisibility: "private",
  });

  await context.repository.putUserPreference("user-defaults", preference);

  await expect(
    context.repository.getUserPreference("user-defaults"),
  ).resolves.toEqual(preference);
});
