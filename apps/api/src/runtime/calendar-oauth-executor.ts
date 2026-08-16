import type { CalendarOAuthCompletion } from "../application/calendar-oauth/calendar-oauth-service.js";
import {
  WebRestApiError,
  type WebRestApiExecutor,
} from "../presentation/rest/web-rest-api-endpoint.js";

export interface CalendarOAuthExecutorDependencies {
  readonly oauth: {
    start(input: {
      readonly userId: string;
      readonly provider: "GOOGLE";
    }): Promise<{ readonly authorizationUrl: string }>;
    complete(input: {
      readonly provider: string;
      readonly state: string;
      readonly code: string;
    }): Promise<CalendarOAuthCompletion>;
  };
  readonly sync: {
    sync(input: {
      readonly userId: string;
      readonly connectionId: string;
    }): Promise<{
      readonly connectionId: string;
      readonly syncedCount: number;
    }>;
  };
  readonly webBaseUrl: string;
}

export function createCalendarOAuthExecutor(
  dependencies: CalendarOAuthExecutorDependencies,
): WebRestApiExecutor {
  return {
    async execute(request) {
      switch (request.operation) {
        case "START_OAUTH": {
          const userId = requireUserId(request.userId);
          requireGoogle(request.pathParameters.provider);
          return {
            kind: "data",
            data: await dependencies.oauth.start({
              userId,
              provider: "GOOGLE",
            }),
          };
        }
        case "OAUTH_CALLBACK": {
          try {
            const completion = await dependencies.oauth.complete({
              provider: request.pathParameters.provider ?? "",
              state: request.query.state ?? "",
              code: request.query.code ?? "",
            });
            await dependencies.sync.sync({
              userId: completion.userId,
              connectionId: completion.connectionId,
            });
            return {
              kind: "redirect",
              location: redirectUrl(dependencies.webBaseUrl, "success"),
            };
          } catch {
            return {
              kind: "redirect",
              location: redirectUrl(dependencies.webBaseUrl, "failed"),
            };
          }
        }
        case "SYNC_CALENDARS":
          return {
            kind: "data",
            data: await dependencies.sync.sync({
              userId: requireUserId(request.userId),
              connectionId: request.pathParameters.connectionId ?? "",
            }),
          };
        default:
          throw new WebRestApiError(
            "INTERNAL_ERROR",
            "Calendar OAuth Lambdaの対象外operationです",
            500,
          );
      }
    },
  };
}

function requireUserId(userId: string | null): string {
  if (userId === null)
    throw new WebRestApiError("UNAUTHORIZED", "認証が必要です", 401);
  return userId;
}

function requireGoogle(provider: string | undefined): void {
  if (provider !== "GOOGLE") {
    throw new WebRestApiError(
      "INVALID_REQUEST",
      "GOOGLEのみ対応しています",
      400,
    );
  }
}

function redirectUrl(baseUrl: string, result: "success" | "failed"): string {
  return `${baseUrl.replace(/\/$/, "")}/settings/calendars?oauth=${result}`;
}
