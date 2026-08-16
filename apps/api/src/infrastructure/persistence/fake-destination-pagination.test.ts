import { createLogicalDestination } from "@schedule-hub/shared";
import { describe, expect, it } from "vitest";
import { FakeScheduleHubRepository } from "./fake-schedule-hub-repository.js";

const destination = (destinationId: string) =>
  createLogicalDestination({
    destinationId,
    name: `登録先${destinationId}`,
    aliases: [],
    description: "",
    physicalCalendarIds: [`calendar-${destinationId}`],
    enabled: true,
  });

describe("Fake RepositoryのDestinationページング", () => {
  it("cursorから重複なく続きを取得できる", async () => {
    const repository = new FakeScheduleHubRepository();
    await repository.putLogicalDestination("user-1", destination("c"));
    await repository.putLogicalDestination("user-1", destination("a"));
    await repository.putLogicalDestination("user-1", destination("b"));

    const first = await repository.listLogicalDestinations("user-1", 2);
    const second = await repository.listLogicalDestinations(
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
