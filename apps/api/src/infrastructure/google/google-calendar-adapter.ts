import { createHash } from "node:crypto";
import { CalendarProviderError } from "../../application/errors/calendar-provider-error.js";
import type {
  CalendarConnectionCredentials,
  CalendarCredentialUpdate,
  CalendarEventCreateInput,
  CalendarEventCreateResult,
  CalendarEventReminders,
  CalendarEventVisibility,
  CalendarProviderAdapter,
} from "../../application/ports/calendar-provider.js";

export interface RefreshedGoogleAccessToken {
  readonly accessToken: string;
  readonly accessTokenExpiresAt: number;
}

export interface GoogleEventDateTime {
  readonly date?: string;
  readonly dateTime?: string;
  readonly timeZone?: string;
}

export interface GoogleEventResource {
  readonly id: string;
  readonly summary: string;
  readonly location?: string;
  readonly description?: string;
  readonly start: GoogleEventDateTime;
  readonly end: GoogleEventDateTime;
  readonly colorId?: string;
  readonly visibility?: CalendarEventVisibility;
  readonly reminders?: CalendarEventReminders;
}

export interface GoogleEventInsertRequest {
  readonly calendarId: string;
  readonly sendUpdates?: "all" | "externalOnly" | "none";
  readonly event: GoogleEventResource;
}

export interface GoogleCalendarApi {
  refreshAccessToken(
    refreshToken: string,
  ): Promise<RefreshedGoogleAccessToken>;
  insertEvent(
    accessToken: string,
    request: GoogleEventInsertRequest,
  ): Promise<{ readonly id: string }>;
}

export type GoogleCalendarApiErrorKind =
  | "AUTH"
  | "DUPLICATE"
  | "PERMANENT"
  | "RATE_LIMIT"
  | "SERVER"
  | "TIMEOUT"
  | "NETWORK";

export class GoogleCalendarApiError extends Error {
  public constructor(
    public readonly kind: GoogleCalendarApiErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "GoogleCalendarApiError";
  }
}

export interface GoogleCalendarAdapterOptions {
  readonly nowEpochSeconds?: () => number;
  readonly maxAttempts?: number;
  readonly retryDelayMs?: (failedAttempt: number) => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

export class GoogleCalendarAdapter implements CalendarProviderAdapter {
  readonly #nowEpochSeconds: () => number;
  readonly #maxAttempts: number;
  readonly #retryDelayMs: (failedAttempt: number) => number;
  readonly #sleep: (milliseconds: number) => Promise<void>;

  public constructor(
    private readonly api: GoogleCalendarApi,
    options: GoogleCalendarAdapterOptions = {},
  ) {
    this.#nowEpochSeconds =
      options.nowEpochSeconds ?? (() => Math.floor(Date.now() / 1000));
    this.#maxAttempts = options.maxAttempts ?? 3;
    this.#retryDelayMs = options.retryDelayMs ?? defaultRetryDelayMs;
    this.#sleep = options.sleep ?? sleep;
  }

  public async createEvent(
    input: CalendarEventCreateInput,
    credentials: CalendarConnectionCredentials,
  ): Promise<CalendarEventCreateResult> {
    let tokenState;
    try {
      tokenState = await this.resolveAccessToken(credentials);
    } catch (error: unknown) {
      throw toCalendarProviderError(error);
    }

    const externalEventId = createGoogleEventId(input);
    const period = toGoogleEventPeriod(input);
    const request: GoogleEventInsertRequest = {
      calendarId: input.externalCalendarId,
      sendUpdates: input.sendUpdates,
      event: {
        id: externalEventId,
        summary: input.title,
        ...(input.location === undefined ? {} : { location: input.location }),
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
        start: period.start,
        end: period.end,
        ...(input.eventColorId == null
          ? {}
          : { colorId: input.eventColorId }),
        ...(input.visibility === undefined
          ? {}
          : { visibility: input.visibility }),
        ...(input.reminders === undefined
          ? {}
          : { reminders: input.reminders }),
      },
    };

    try {
      await this.insertEventWithRetry(tokenState.accessToken, request);
    } catch (error: unknown) {
      if (isDuplicateError(error)) {
        // 決定的IDによる前回リクエストで作成済みのため成功として扱う。
      } else if (isAuthError(error) && tokenState.credentialUpdate === null) {
        try {
          const refreshed = await this.api.refreshAccessToken(
            credentials.refreshToken,
          );
          tokenState = {
            accessToken: refreshed.accessToken,
            credentialUpdate: refreshed,
          };
          await this.insertEventWithRetry(tokenState.accessToken, request);
        } catch (refreshError: unknown) {
          throw toCalendarProviderError(refreshError);
        }
      } else {
        throw toCalendarProviderError(error);
      }
    }

    return {
      externalEventId,
      credentialUpdate: tokenState.credentialUpdate,
    };
  }

  private async insertEventWithRetry(
    accessToken: string,
    request: GoogleEventInsertRequest,
  ): Promise<void> {
    for (let attempt = 1; attempt <= this.#maxAttempts; attempt += 1) {
      try {
        await this.api.insertEvent(accessToken, request);
        return;
      } catch (error: unknown) {
        if (!isRetryable(error) || attempt === this.#maxAttempts) {
          throw error;
        }
        await this.#sleep(this.#retryDelayMs(attempt));
      }
    }
  }

  private async resolveAccessToken(
    credentials: CalendarConnectionCredentials,
  ): Promise<{
    readonly accessToken: string;
    readonly credentialUpdate: CalendarCredentialUpdate | null;
  }> {
    const refreshSkewSeconds = 60;
    if (
      credentials.accessTokenExpiresAt >
      this.#nowEpochSeconds() + refreshSkewSeconds
    ) {
      return { accessToken: credentials.accessToken, credentialUpdate: null };
    }
    const refreshed = await this.api.refreshAccessToken(
      credentials.refreshToken,
    );
    return {
      accessToken: refreshed.accessToken,
      credentialUpdate: refreshed,
    };
  }
}

function isRetryable(error: unknown): boolean {
  return (
    error instanceof GoogleCalendarApiError &&
    (error.kind === "TIMEOUT" ||
      error.kind === "NETWORK" ||
      error.kind === "RATE_LIMIT" ||
      error.kind === "SERVER")
  );
}

function isAuthError(error: unknown): boolean {
  return error instanceof GoogleCalendarApiError && error.kind === "AUTH";
}

function isDuplicateError(error: unknown): boolean {
  return (
    error instanceof GoogleCalendarApiError && error.kind === "DUPLICATE"
  );
}

function toCalendarProviderError(error: unknown): CalendarProviderError {
  if (isAuthError(error)) {
    return new CalendarProviderError(
      "AUTH_EXPIRED",
      "Google Calendarの認証が失効しています",
      { cause: error },
    );
  }
  if (isRetryable(error)) {
    return new CalendarProviderError(
      "RETRY_EXHAUSTED",
      "Google Calendar APIの一時障害が解消しませんでした",
      { cause: error },
    );
  }
  return new CalendarProviderError(
    "REQUEST_FAILED",
    "Google Calendar APIへのリクエストに失敗しました",
    { cause: error },
  );
}

function defaultRetryDelayMs(failedAttempt: number): number {
  const exponential = 2 ** (failedAttempt - 1) * 1_000;
  const jitter = Math.floor(Math.random() * 1_001);
  return Math.min(exponential + jitter, 64_000);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function toGoogleEventPeriod(
  input: Pick<
    CalendarEventCreateInput,
    "scheduleType" | "start" | "end" | "timezone"
  >,
): { readonly start: GoogleEventDateTime; readonly end: GoogleEventDateTime } {
  if (input.scheduleType === "ALL_DAY") {
    return {
      start: { date: input.start },
      end: { date: addUtcCalendarDay(input.end) },
    };
  }
  return {
    start: { dateTime: input.start, timeZone: input.timezone },
    end: { dateTime: input.end, timeZone: input.timezone },
  };
}

function addUtcCalendarDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

export function createGoogleEventId(input: {
  readonly userId: string;
  readonly operationId: string;
  readonly physicalCalendarId: string;
}): string {
  return createHash("sha256")
    .update(
      `${input.userId}\u0000${input.operationId}\u0000${input.physicalCalendarId}`,
      "utf8",
    )
    .digest("hex");
}
