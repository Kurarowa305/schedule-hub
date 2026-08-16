import { describe, expect, it, vi } from "vitest";
import { createCalendarOAuthExecutor } from "./calendar-oauth-executor.js";

describe("Calendar OAuth REST executor", () => {
  it("認証ユーザーでOAuthを開始する", async () => {
    const start = vi.fn(async () => ({
      authorizationUrl: "https://google.example/auth",
    }));
    const executor = createCalendarOAuthExecutor({
      oauth: { start, complete: vi.fn() },
      sync: { sync: vi.fn() },
      webBaseUrl: "https://app.example.com",
    });

    await expect(
      executor.execute({
        operation: "START_OAUTH",
        userId: "user-1",
        pathParameters: { provider: "GOOGLE" },
        query: {},
        body: null,
      }),
    ).resolves.toEqual({
      kind: "data",
      data: { authorizationUrl: "https://google.example/auth" },
    });
    expect(start).toHaveBeenCalledWith({
      userId: "user-1",
      provider: "GOOGLE",
    });
  });

  it("callback完了後にCalendar同期しWebへ成功redirectする", async () => {
    const complete = vi.fn(async () => ({
      userId: "user-1",
      connectionId: "conn-1",
      provider: "GOOGLE" as const,
      accountIdentifier: "test@example.com",
      status: "ACTIVE" as const,
    }));
    const sync = vi.fn(async () => ({
      connectionId: "conn-1",
      syncedCount: 2,
    }));
    const executor = createCalendarOAuthExecutor({
      oauth: { start: vi.fn(), complete },
      sync: { sync },
      webBaseUrl: "https://app.example.com/",
    });

    await expect(
      executor.execute({
        operation: "OAUTH_CALLBACK",
        userId: null,
        pathParameters: { provider: "GOOGLE" },
        query: { code: "code-1", state: "state-1" },
        body: null,
      }),
    ).resolves.toEqual({
      kind: "redirect",
      location: "https://app.example.com/settings/calendars?oauth=success",
    });
    expect(sync).toHaveBeenCalledWith({
      userId: "user-1",
      connectionId: "conn-1",
    });
  });
});
