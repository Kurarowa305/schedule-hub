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

describe("DynamoDB OAuthState", () => {
  it("ttlを含むstateを保存・取得できる", async () => {
    const state = {
      state: "state-1",
      userId: "user-1",
      provider: "GOOGLE" as const,
      purpose: "CALENDAR_CONNECT" as const,
      createdAt: 1_800_000_000,
      ttl: 1_800_000_600,
    };

    await context.repository.putOAuthState(state);

    await expect(context.repository.getOAuthState(state.state)).resolves.toEqual(
      state,
    );
  });
});
