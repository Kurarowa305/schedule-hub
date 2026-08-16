import { describe, expect, it } from "vitest";
import { FakeScheduleHubRepository } from "./fake-schedule-hub-repository.js";

const operation = (operationId: string, createdAt: string) => ({
  operationId,
  userId: "user-1",
  payloadHash: `sha256:${operationId}`,
  status: "SUCCESS" as const,
  leaseExpiresAt: null,
  createdAt,
});

describe("Fake RepositoryのOperation履歴", () => {
  it("新しい順にcursorページングできる", async () => {
    const repository = new FakeScheduleHubRepository();
    await repository.putCreateOperationIfAbsent(
      operation("operation-2", "2026-08-14T09:02:00.000Z"),
    );
    await repository.putCreateOperationIfAbsent(
      operation("operation-1", "2026-08-14T09:01:00.000Z"),
    );
    await repository.putCreateOperationIfAbsent(
      operation("operation-3", "2026-08-14T09:03:00.000Z"),
    );

    const first = await repository.listRecentCreateOperations("user-1", 2);
    const second = await repository.listRecentCreateOperations(
      "user-1",
      2,
      first.nextCursor ?? undefined,
    );

    expect(first.items.map(({ operationId }) => operationId)).toEqual([
      "operation-3",
      "operation-2",
    ]);
    expect(second.items.map(({ operationId }) => operationId)).toEqual([
      "operation-1",
    ]);
    expect(second.nextCursor).toBeNull();
  });
});
