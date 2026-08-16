import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDynamoDbTestContext,
  type DynamoDbTestContext,
} from "./dynamodb-test-harness.js";

let context: DynamoDbTestContext;

beforeAll(async () => {
  context = await createDynamoDbTestContext();
});
afterAll(async () => context.close());

const connectionBase = {
  provider: "GOOGLE" as const,
  accountIdentifier: "calendar-user@example.com",
  accessToken: "access",
  refreshToken: "refresh",
  accessTokenExpiresAt: 1_800_003_600,
  status: "ACTIVE" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("DynamoDB Calendar同期", () => {
  it("同一アカウントの旧Connectionに属するPhysicalCalendarを取得・更新できる", async () => {
    await context.repository.putCalendarConnection("sync-user", {
      ...connectionBase,
      connectionId: "conn-old",
    });
    await context.repository.putCalendarConnection("sync-user", {
      ...connectionBase,
      connectionId: "conn-new",
    });
    const calendar = {
      physicalCalendarId: "pcal-existing",
      provider: "GOOGLE" as const,
      connectionId: "conn-old",
      externalCalendarId: "work@example.com",
      name: "仕事",
      accessRole: "writer" as const,
      writable: true,
      status: "ACTIVE" as const,
      eventColorId: "5",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    await context.repository.putPhysicalCalendar("sync-user", calendar);

    await expect(
      context.repository.getCalendarConnection("sync-user", "conn-new"),
    ).resolves.toMatchObject({ connectionId: "conn-new" });
    await expect(
      context.repository.listPhysicalCalendarsForAccount(
        "sync-user",
        "GOOGLE",
        "calendar-user@example.com",
      ),
    ).resolves.toEqual([calendar]);

    const updated = {
      ...calendar,
      connectionId: "conn-new",
      name: "新しい仕事",
    };
    await context.repository.putPhysicalCalendar("sync-user", updated);
    await expect(
      context.repository.listPhysicalCalendarsForAccount(
        "sync-user",
        "GOOGLE",
        "calendar-user@example.com",
      ),
    ).resolves.toEqual([updated]);
  });
});
