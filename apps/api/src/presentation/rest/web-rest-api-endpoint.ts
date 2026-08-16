export type WebRestApiOperation =
  | "GET_ME"
  | "UPDATE_PREFERENCES"
  | "LIST_CONNECTIONS"
  | "START_OAUTH"
  | "OAUTH_CALLBACK"
  | "DISCONNECT_CALENDAR"
  | "SYNC_CALENDARS"
  | "LIST_PHYSICAL_CALENDARS"
  | "UPDATE_PHYSICAL_CALENDAR"
  | "LIST_DESTINATIONS"
  | "CREATE_DESTINATION"
  | "UPDATE_DESTINATION"
  | "LIST_DISPLAY_TARGETS"
  | "PUT_DISPLAY_TARGET"
  | "LIST_OPERATIONS"
  | "GET_OPERATION";

export interface WebRestApiAuthentication {
  readonly userId: string;
}

export interface WebRestApiAuthenticator {
  authenticate(request: Request): Promise<WebRestApiAuthentication>;
}

export interface WebRestApiExecutionRequest {
  readonly operation: WebRestApiOperation;
  readonly userId: string | null;
  readonly pathParameters: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, string>>;
  readonly body: Readonly<Record<string, unknown>> | null;
}

export type WebRestApiExecutionResult =
  | { readonly kind: "data"; readonly data: unknown; readonly status?: number }
  | {
      readonly kind: "page";
      readonly data: readonly unknown[];
      readonly nextCursor: string | null;
    }
  | { readonly kind: "redirect"; readonly location: string };

export interface WebRestApiExecutor {
  execute(
    request: WebRestApiExecutionRequest,
  ): Promise<WebRestApiExecutionResult>;
}

export interface WebRestApiEndpointDependencies {
  readonly authenticator: WebRestApiAuthenticator;
  readonly executor: WebRestApiExecutor;
}

export interface WebRestApiEndpoint {
  fetch(request: Request): Promise<Response>;
}

export type WebRestApiErrorCode =
  | "INVALID_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_DESTINATION"
  | "INVALID_PHYSICAL_CALENDAR"
  | "PROVIDER_AUTH_EXPIRED"
  | "PROVIDER_API_ERROR"
  | "INTERNAL_ERROR";

export class WebRestApiError extends Error {
  public constructor(
    public readonly code: WebRestApiErrorCode,
    message: string,
    public readonly status: number,
    public readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "WebRestApiError";
  }
}

interface RouteDefinition {
  readonly method: string;
  readonly pattern: RegExp;
  readonly parameterNames: readonly string[];
  readonly operation: WebRestApiOperation;
  readonly authenticationRequired: boolean;
  readonly bodyRequired: boolean;
}

const routes: readonly RouteDefinition[] = [
  route("GET", "/api/v1/me", "GET_ME"),
  route("PATCH", "/api/v1/me/preferences", "UPDATE_PREFERENCES", [], true),
  route("GET", "/api/v1/calendar-connections", "LIST_CONNECTIONS"),
  route(
    "POST",
    "/api/v1/calendar-connections/:provider/oauth/start",
    "START_OAUTH",
    ["provider"],
  ),
  route(
    "GET",
    "/api/v1/oauth/:provider/callback",
    "OAUTH_CALLBACK",
    ["provider"],
    false,
    false,
  ),
  route(
    "DELETE",
    "/api/v1/calendar-connections/:connectionId",
    "DISCONNECT_CALENDAR",
    ["connectionId"],
  ),
  route(
    "POST",
    "/api/v1/calendar-connections/:connectionId/sync-calendars",
    "SYNC_CALENDARS",
    ["connectionId"],
  ),
  route("GET", "/api/v1/physical-calendars", "LIST_PHYSICAL_CALENDARS"),
  route(
    "PATCH",
    "/api/v1/physical-calendars/:physicalCalendarId",
    "UPDATE_PHYSICAL_CALENDAR",
    ["physicalCalendarId"],
    true,
  ),
  route("POST", "/api/v1/destinations", "CREATE_DESTINATION", [], true),
  route("GET", "/api/v1/destinations", "LIST_DESTINATIONS"),
  route(
    "PATCH",
    "/api/v1/destinations/:destinationId",
    "UPDATE_DESTINATION",
    ["destinationId"],
    true,
  ),
  route("GET", "/api/v1/external-display-targets", "LIST_DISPLAY_TARGETS"),
  route(
    "PUT",
    "/api/v1/external-display-targets/:target",
    "PUT_DISPLAY_TARGET",
    ["target"],
    true,
  ),
  route("GET", "/api/v1/operations", "LIST_OPERATIONS"),
  route("GET", "/api/v1/operations/:operationId", "GET_OPERATION", [
    "operationId",
  ]),
];

export function createWebRestApiEndpoint(
  dependencies: WebRestApiEndpointDependencies,
): WebRestApiEndpoint {
  return {
    async fetch(request: Request): Promise<Response> {
      try {
        return await handleRequest(request, dependencies);
      } catch (error: unknown) {
        return errorResponse(error);
      }
    },
  };
}

async function handleRequest(
  request: Request,
  dependencies: WebRestApiEndpointDependencies,
): Promise<Response> {
  const url = new URL(request.url);
  const matchedPath = routes
    .map((definition) => ({
      definition,
      match: definition.pattern.exec(url.pathname),
    }))
    .find(
      ({ definition, match }) =>
        match !== null && definition.method === request.method,
    );
  if (matchedPath === undefined) {
    const allowedRoute = routes.find(({ pattern }) =>
      pattern.test(url.pathname),
    );
    if (allowedRoute !== undefined) {
      return new Response(null, {
        status: 405,
        headers: { Allow: allowedRoute.method },
      });
    }
    throw new WebRestApiError("NOT_FOUND", "Endpointが見つかりません", 404);
  }

  const userId = matchedPath.definition.authenticationRequired
    ? await authenticate(dependencies.authenticator, request)
    : null;
  const body = await parseBody(request, matchedPath.definition.bodyRequired);
  if (body !== null && Object.hasOwn(body, "userId")) {
    throw new WebRestApiError(
      "INVALID_REQUEST",
      "userIdはRequest bodyに指定できません",
      400,
    );
  }
  const pathParameters = extractPathParameters(
    matchedPath.definition,
    matchedPath.match,
  );
  const query = Object.fromEntries(url.searchParams.entries());
  if (
    matchedPath.definition.operation === "OAUTH_CALLBACK" &&
    (query.code === undefined || query.state === undefined)
  ) {
    throw new WebRestApiError(
      "INVALID_REQUEST",
      "codeとstateを指定してください",
      400,
    );
  }

  const result = await dependencies.executor.execute({
    operation: matchedPath.definition.operation,
    userId,
    pathParameters,
    query,
    body,
  });
  return successResponse(result);
}

async function authenticate(
  authenticator: WebRestApiAuthenticator,
  request: Request,
): Promise<string> {
  try {
    return (await authenticator.authenticate(request)).userId;
  } catch {
    throw new WebRestApiError("UNAUTHORIZED", "認証が必要です", 401);
  }
}

async function parseBody(
  request: Request,
  required: boolean,
): Promise<Readonly<Record<string, unknown>> | null> {
  if (!required) return null;
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    throw new WebRestApiError(
      "INVALID_REQUEST",
      "Content-Typeにはapplication/jsonを指定してください",
      400,
    );
  }
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new Error("body is not an object");
    }
    return body as Readonly<Record<string, unknown>>;
  } catch {
    throw new WebRestApiError(
      "INVALID_REQUEST",
      "Request bodyは有効なJSON objectで指定してください",
      400,
    );
  }
}

function extractPathParameters(
  definition: RouteDefinition,
  match: RegExpExecArray | null,
): Readonly<Record<string, string>> {
  if (match === null) return {};
  try {
    return Object.fromEntries(
      definition.parameterNames.map((name, index) => [
        name,
        decodeURIComponent(match[index + 1] ?? ""),
      ]),
    );
  } catch {
    throw new WebRestApiError(
      "INVALID_REQUEST",
      "Path parameterが不正です",
      400,
    );
  }
}

function successResponse(result: WebRestApiExecutionResult): Response {
  if (result.kind === "redirect") {
    return new Response(null, {
      status: 302,
      headers: { Location: result.location },
    });
  }
  if (result.kind === "page") {
    return Response.json({ data: result.data, nextCursor: result.nextCursor });
  }
  return Response.json({ data: result.data }, { status: result.status ?? 200 });
}

function errorResponse(error: unknown): Response {
  const known =
    error instanceof WebRestApiError
      ? error
      : new WebRestApiError(
          "INTERNAL_ERROR",
          "予期しないエラーが発生しました",
          500,
        );
  return Response.json(
    {
      error: {
        code: known.code,
        message: known.message,
        details: known.details,
      },
    },
    {
      status: known.status,
      ...(known.status === 401
        ? { headers: { "WWW-Authenticate": "Bearer" } }
        : {}),
    },
  );
}

function route(
  method: string,
  path: string,
  operation: WebRestApiOperation,
  parameterNames: readonly string[] = [],
  bodyRequired = false,
  authenticationRequired = true,
): RouteDefinition {
  const pattern = path
    .split("/")
    .map((segment) =>
      segment.startsWith(":") ? "([^/]+)" : escapeRegex(segment),
    )
    .join("/");
  return {
    method,
    pattern: new RegExp(`^${pattern}$`),
    parameterNames,
    operation,
    authenticationRequired,
    bodyRequired,
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
