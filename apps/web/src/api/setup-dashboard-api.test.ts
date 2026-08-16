import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBrowserSetupDashboardApi } from "./setup-dashboard-api.js";

beforeEach(() => {
  window.localStorage.setItem(
    "schedule-hub.auth-session",
    JSON.stringify({ accessToken: "web-access-token" }),
  );
});

describe("Setup Dashboard API client", () => {
  it("必要な4 APIをBearer token付きで取得してsnapshotへ集約する", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.includes("calendar-connections")) return json({ data: [] });
      if (path.includes("physical-calendars")) return json({ data: [] });
      if (path.includes("destinations")) return json({ data: [] });
      return json({ data: [] });
    });

    await expect(
      createBrowserSetupDashboardApi(fetchMock).getSnapshot(),
    ).resolves.toEqual({
      connections: [],
      calendars: [],
      destinations: [],
      recentOperations: [],
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer web-access-token",
      );
    }
  });

  it("Google OAuth開始APIをPOSTしてauthorization URLを返す", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json({ data: { authorizationUrl: "https://accounts.google.com/auth" } }),
    );

    await expect(
      createBrowserSetupDashboardApi(fetchMock).startGoogleOAuth(),
    ).resolves.toEqual({
      authorizationUrl: "https://accounts.google.com/auth",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/calendar-connections/GOOGLE/oauth/start",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("非2xx responseを画面へ成功データとして渡さない", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 }),
    );

    await expect(
      createBrowserSetupDashboardApi(fetchMock).getSnapshot(),
    ).rejects.toThrow("Schedule Hub API error: 401");
  });
});

function json(body: unknown): Response {
  return Response.json(body, { status: 200 });
}
