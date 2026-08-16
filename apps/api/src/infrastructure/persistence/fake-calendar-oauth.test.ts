import { describe, expect, it } from "vitest";
import { FakeScheduleHubRepository } from "./fake-schedule-hub-repository.js";

describe("Fake Repository Calendar OAuth", () => {
  it("OAuthStateの一回限り消費とConnection再取得を再現する", async () => {
    const repository = new FakeScheduleHubRepository();
    const state = {
      state: "single-use-state",
      userId: "user-1",
      provider: "GOOGLE" as const,
      purpose: "CALENDAR_CONNECT" as const,
      createdAt: 1_800_000_000,
      ttl: 1_800_000_600,
    };
    const connection = {
      connectionId: "conn_1",
      provider: "GOOGLE" as const,
      accountIdentifier: "calendar-user@example.com",
      accessToken: "access",
      refreshToken: "refresh",
      accessTokenExpiresAt: 1_800_003_600,
      status: "ACTIVE" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    await repository.putOAuthState(state);
    await repository.putCalendarConnection("user-1", connection);

    await expect(repository.takeOAuthState(state.state)).resolves.toEqual(
      state,
    );
    await expect(repository.takeOAuthState(state.state)).resolves.toBeNull();
    await expect(
      repository.findCalendarConnection(
        "user-1",
        "GOOGLE",
        "calendar-user@example.com",
      ),
    ).resolves.toEqual(connection);
  });
});
