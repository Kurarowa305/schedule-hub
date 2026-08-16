import { createUserPreference } from "@schedule-hub/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

describe("DynamoDB UserPreference", () => {
  it("USER Item CollectionのPROFILEへ保存・取得できる", async () => {
    const preference = createUserPreference({
      timezone: "Asia/Tokyo",
      defaultDurationMinutes: 90,
      defaultDestinationIds: ["private"],
    });

    await context.repository.putUserPreference("user-1", preference);

    await expect(
      context.repository.getUserPreference("user-1"),
    ).resolves.toEqual(preference);
  });
});
