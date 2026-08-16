import { createUserPreference } from "@schedule-hub/shared";
import { describe, expect, it } from "vitest";
import { FakeScheduleHubRepository } from "./fake-schedule-hub-repository.js";

describe("Fake RepositoryのUserPreference", () => {
  it("ユーザー単位で保存・取得できる", async () => {
    const repository = new FakeScheduleHubRepository();
    const preference = createUserPreference({
      timezone: "Asia/Tokyo",
      defaultDurationMinutes: 60,
      defaultDestinationIds: ["private"],
    });

    await repository.putUserPreference("user-1", preference);

    await expect(repository.getUserPreference("user-1")).resolves.toEqual(
      preference,
    );
    await expect(repository.getUserPreference("user-2")).resolves.toBeNull();
  });
});
