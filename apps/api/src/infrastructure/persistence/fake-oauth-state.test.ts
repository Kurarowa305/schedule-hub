import { describe, expect, it } from "vitest";
import { FakeScheduleHubRepository } from "./fake-schedule-hub-repository.js";

describe("Fake RepositoryのOAuthState", () => {
  it("TTLをUnix Epoch Secondsとして保存・取得できる", async () => {
    const repository = new FakeScheduleHubRepository();
    const oauthState = {
      state: "state-random-value",
      userId: "user-1",
      provider: "GOOGLE" as const,
      purpose: "CALENDAR_CONNECT" as const,
      createdAt: 1_786_590_000,
      ttl: 1_786_590_600,
    };

    await repository.putOAuthState(oauthState);

    await expect(repository.getOAuthState(oauthState.state)).resolves.toEqual(
      oauthState,
    );
  });
});
