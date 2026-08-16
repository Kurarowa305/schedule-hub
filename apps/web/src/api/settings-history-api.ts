import type {
  ExternalDisplayTarget,
  OperationHistoryItem,
  SettingsCalendar,
  SettingsDestination,
  SettingsHistoryApi,
} from "../features/settings/settings-history.js";

export interface UserPreferences {
  readonly timezone: string;
  readonly defaultDurationMinutes: number;
  readonly defaultDestinationIds: readonly string[];
}

export interface SettingsSnapshot {
  readonly preferences: UserPreferences;
  readonly calendars: readonly SettingsCalendar[];
  readonly destinations: readonly SettingsDestination[];
  readonly targets: readonly ExternalDisplayTarget[];
  readonly operations: readonly OperationHistoryItem[];
}

export interface BrowserSettingsApi extends SettingsHistoryApi {
  load(): Promise<SettingsSnapshot>;
  savePreferences(input: UserPreferences): Promise<void>;
}

interface DataResponse<T> {
  readonly data: T;
}

interface PageResponse<T> extends DataResponse<readonly T[]> {
  readonly nextCursor: string | null;
}

export function createBrowserSettingsApi(
  fetchImplementation: typeof fetch = fetch,
): BrowserSettingsApi {
  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const sessionValue = window.localStorage.getItem(
      "schedule-hub.auth-session",
    );
    const token =
      sessionValue === null
        ? null
        : (JSON.parse(sessionValue) as { accessToken?: unknown }).accessToken;
    if (typeof token !== "string") throw new Error("認証セッションが不正です");
    const response = await fetchImplementation(path, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(init?.body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
      },
    });
    if (!response.ok)
      throw new Error(`Schedule Hub API error: ${response.status}`);
    return (await response.json()) as T;
  };

  return {
    async load() {
      const [me, calendars, destinations, targets, operationPage] =
        await Promise.all([
          request<DataResponse<UserPreferences>>("/api/v1/me"),
          request<DataResponse<readonly SettingsCalendar[]>>(
            "/api/v1/physical-calendars",
          ),
          request<DataResponse<readonly SettingsDestination[]>>(
            "/api/v1/destinations",
          ),
          request<DataResponse<readonly ExternalDisplayTarget[]>>(
            "/api/v1/external-display-targets",
          ),
          request<PageResponse<Omit<OperationHistoryItem, "events">>>(
            "/api/v1/operations?limit=20",
          ),
        ]);
      const operationDetails = await Promise.all(
        operationPage.data.map(({ operationId }) =>
          request<DataResponse<OperationHistoryItem>>(
            `/api/v1/operations/${encodeURIComponent(operationId)}`,
          ).then(({ data }) => data),
        ),
      );
      return {
        preferences: me.data,
        calendars: calendars.data,
        destinations: destinations.data,
        targets: targets.data,
        operations: operationDetails,
      };
    },
    async saveDestination(input) {
      await request<DataResponse<{ destinationId: string }>>(
        "/api/v1/destinations",
        { method: "POST", body: JSON.stringify(input) },
      );
    },
    async saveDisplayTarget(target, input) {
      await request<DataResponse<unknown>>(
        `/api/v1/external-display-targets/${target}`,
        { method: "PUT", body: JSON.stringify(input) },
      );
    },
    async savePreferences(input) {
      await request<DataResponse<unknown>>("/api/v1/me/preferences", {
        method: "PATCH",
        body: JSON.stringify(input),
      });
    },
  };
}
