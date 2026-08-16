import { describe, expect, it } from "vitest";
import { FakeScheduleHubRepository } from "./fake-schedule-hub-repository.js";

const operation = {
  operationId: "op_01J5AR7Y5N3K8M2P6Q9T4VWXZB",
  userId: "user-1",
  payloadHash: "sha256:payload-a",
  status: "PROCESSING" as const,
  leaseExpiresAt: "2026-08-14T09:01:00.000Z",
  createdAt: "2026-08-14T09:00:00.000Z",
};

describe("Fake ScheduleHubRepository", () => {
  it("CreateOperationを同じoperationIdで上書きしない", async () => {
    const repository = new FakeScheduleHubRepository();

    await expect(
      repository.putCreateOperationIfAbsent(operation),
    ).resolves.toBe(true);
    await expect(
      repository.putCreateOperationIfAbsent({
        ...operation,
        payloadHash: "sha256:different",
      }),
    ).resolves.toBe(false);
    await expect(
      repository.getCreateOperation(operation.operationId),
    ).resolves.toEqual(operation);
  });
});
