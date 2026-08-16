import type {
  SetupDashboardApi,
  SetupSnapshot,
} from "../features/setup/setup-dashboard.js";

interface DataResponse<T> {
  readonly data: T;
}

export function createBrowserSetupDashboardApi(
  fetchImplementation: typeof fetch = fetch,
): SetupDashboardApi {
  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const session = loadSession();
    const response = await fetchImplementation(path, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${session.accessToken}`,
        ...(init?.body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
        ...init?.headers,
      },
    });
    if (!response.ok) {
      throw new Error(`Schedule Hub API error: ${response.status}`);
    }
    return (await response.json()) as T;
  };

  return {
    async getSnapshot(): Promise<SetupSnapshot> {
      const [connections, calendars, destinations, operations] =
        await Promise.all([
          request<DataResponse<SetupSnapshot["connections"]>>(
            "/api/v1/calendar-connections",
          ),
          request<DataResponse<SetupSnapshot["calendars"]>>(
            "/api/v1/physical-calendars",
          ),
          request<DataResponse<SetupSnapshot["destinations"]>>(
            "/api/v1/destinations",
          ),
          request<DataResponse<SetupSnapshot["recentOperations"]>>(
            "/api/v1/operations?limit=5",
          ),
        ]);
      return {
        connections: connections.data,
        calendars: calendars.data,
        destinations: destinations.data,
        recentOperations: operations.data,
      };
    },
    async startGoogleOAuth() {
      const response = await request<
        DataResponse<{ authorizationUrl: string }>
      >("/api/v1/calendar-connections/GOOGLE/oauth/start", { method: "POST" });
      return response.data;
    },
  };
}

function loadSession(): { readonly accessToken: string } {
  const value = window.localStorage.getItem("schedule-hub.auth-session");
  if (value === null) throw new Error("認証セッションが見つかりません");
  try {
    const session = JSON.parse(value) as { readonly accessToken?: unknown };
    if (
      typeof session.accessToken !== "string" ||
      session.accessToken.length === 0
    ) {
      throw new Error("access token is missing");
    }
    return { accessToken: session.accessToken };
  } catch {
    throw new Error("認証セッションが不正です");
  }
}
