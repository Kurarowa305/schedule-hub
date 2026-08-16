import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StoredCreateOperation } from "../../application/ports/schedule-hub-repository.js";
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

const operation = (
  operationId: string,
  userId: string,
  createdAt: string,
): StoredCreateOperation => ({
  operationId,
  userId,
  payloadHash: `hash-${operationId}`,
  status: "SUCCESS",
  leaseExpiresAt: null,
  createdAt,
});

describe("DynamoDB CreateOperatio~ot", () => {
  it("GSI1–Ýkcursor{‰Í7j_ß—_öæü¶ü–}y‹", async () => {
    await context.repository.putCreateOperationIfAbsent(
      operation("op-a", "user-1", "2026-01-01T00:00:00.000Z"),
    );
    await context.repository.putCreateOperationIfAbsent(
      operation("op-c", "user-1", "2026-01-03T00:00:00.000Z"),
    );
    await context.repository.putCreateOperationIfAbsent(
      operation("op-b", "user-1", "2026-01-02T00:00:00.000Z"),
    );
    await context.repository.putCreateOperationIfAbsent(
      operation("other", "user-2", "2026-01-04T00:00:00.000Z"),
    );

    const first = await context.repository.listRecentCreateOperations(
      "user-1",
      2,
    );
    const second = await context.repository.listRecentCreateOperations(
      "user-1",
      2,
      first.nextCursor ?? undefined,
    );

    expect(first.items.map(({ operationId }) => operationId)).toEqual([
      "op-c",
      "op-b",
    ]);
    expect(first.nextCursor).not.toBeNull();
    expect(second.items.map(({ operationId }) => operationId)).toEqual([
      "op-a",
    ]);
    expect(second.nextCursor).toBeNull();
  });
});
