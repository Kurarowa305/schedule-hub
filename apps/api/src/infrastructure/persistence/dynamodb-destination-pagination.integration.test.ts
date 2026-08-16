import { createLogicalDestination } from "@schedule-hub/shared";
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

const destination = (destinationId: string) =>
  createLogicalDestination({
    destinationId,
    name: `登録先${destinationId}`,
    aliases: [],
    description: "",
    physicalCalendarIds: [`calendar-${destinationId}`],
    enabled: true,
  });

describe("DynamoDB LogicalDestination", () => {
  it("USER Item Collectionをcursorから重複なく取得できる", async () => {
    await context.repository.putLogicalDestination("user-1", destination("c"));
    await context.repository.putLogicalDestination("user-1", destination("a"));
    await context.repository.putLogicalDestination("user-1", destination("b"));

    const first = await context.repository.listLogicalDestinations("user-1", 2);
    const second = await context.repository.listLogicalDestinations(
      "user-1",
      2,
      first.nextCursor ?? undefined,
    );

    expect(first.items.map(({ destinationId }) => destinationId)).toEqual([
      "a",
      "b",
    ]);
    expect(first.nextCursor).not.toBeNull();
    expect(second.items.map(({ destinationId }) => destinationId)).toEqual([
      "c",
    ]);
    expect(second.nextCursor).toBeNull();
  });
});
