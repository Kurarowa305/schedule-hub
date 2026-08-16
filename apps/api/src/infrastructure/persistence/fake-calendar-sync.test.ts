import { describe, expect, it } from "vitest";
import { FakeScheduleHubRepository } from "./fake-schedule-hub-repository.js";

describe("Fake Repository Calendar同期", () => {
  it("Connection所有権と同一アカウントのPhysicalCalendarを再現する", async () => {
    const repository = new FakeScheduleHubRepository();
    const connection = {
      connectionId: "conn-1",
      provider: "GOOGLE" as const,
      accountIdentifier: "user@example.com",
      accessToken: "access",
      refreshToken: "refresh",
      accessTokenExpiresAt: 1_800_003_600,
      status: "ACTIVE" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const calendar = {
      physicalCalendarId: "pcal-1",
      provider: "GOOGLE" as const,
      connectionId: "conn-1",
      externalCalendarId: "work@example.com",
      name: "仕事",
      accessRole: "owner" as const,
      writable: true,
      status: "ACTIVE" as const,
      eventColorId: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    await repository.putCalendarConnection("user-1", connection);
    await repository.putPhysicalCalendar("user-1", calendar);

    await expect(
      repository.getCalendarConnection("user-1", "conn-1"),
    ).resolves.toEqual(connection);
    await expect(
      repository.getCalendarConnection("other", "conn-1"),
    ).resolves.toBeNull();
    await expect(
      repository.listPhysicalCalendarsForAccount(
        "user-1",
        "GOOGLE",
        "user@example.com",
      ),
    ).resolves.toEqual([calendar]);
  });
});
