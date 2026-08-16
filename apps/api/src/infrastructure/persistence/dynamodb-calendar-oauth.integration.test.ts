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

describe("DynamoDB Calendar OAuth", () => {
  it("OAuthStateを一度だけatomicに取得して削除する", async () => {
    const state = {
      state: "single-use-state",
      userId: "user-oauth",
      provider: "GOOGLE" as const,
      purpose: "CALENDAR_CONNECT" as const,
      createdAt: 1_800_000_000,
      ttl: 1_800_000_600,
    };
    await context.repository.putOAuthState(state);

    await expect(
      context.repository.takeOAuthState(state.state),
    ).resolves.toEqual(state);
    await expect(
      context.repository.takeOAuthState(state.state),
    ).resolves.toBeNull();
  });

  it("ユーザー・Provider・accountIdentifierで既存Connectionを取得する", async () => {
    const connection = {
      connectionId: "conn_existing",
      provider: "GOOGLE" as const,
      accountIdentifier: "calendar-user@example.com",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      accessTokenExpiresAt: 1_800_003_600,
      status: "REAUTH_REQUIRED" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    };

    await context.repository.putCalendarConnection("user-oauth", connection);

    await expect(
      context.repository.findCalendarConnection(
        "user-oauth",
        "GOOGLE",
        "calendar-user@example.com",
      ),
    ).resolves.toEqual(connection);
    await expect(
      context.repository.findCalendarConnection(
        "another-user",
        "GOOGLE",
        "calendar-user@example.com",
      ),
    ).resolves.toBeNull();
  });
});
