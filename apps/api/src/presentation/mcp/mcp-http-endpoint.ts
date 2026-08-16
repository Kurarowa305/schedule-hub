import {
  fromJsonSchema,
  McpServer,
  WebStandardStreamableHTTPServerTransport,
  type AuthInfo,
} from "@modelcontextprotocol/server";
import {
  createScheduleInputSchema,
  createScheduleOutputSchema,
  getScheduleContextInputSchema,
  getScheduleContextOutputSchema,
  mcpToolDefinitions,
  type McpToolName,
  validateMcpToolOutput,
} from "@schedule-hub/shared";
import {
  CreateScheduleError,
  type CreateScheduleErrorCode,
} from "../../application/errors/create-schedule-error.js";

export interface AuthenticatedMcpRequest {
  readonly userId: string;
  readonly token: string;
  readonly clientId: string;
  readonly scopes: readonly string[];
  readonly expiresAt?: number;
  readonly resource?: URL;
}

export interface McpRequestAuthenticator {
  authenticate(request: Request): Promise<AuthenticatedMcpRequest>;
}

export interface McpToolExecutionRequest {
  readonly userId: string;
  readonly toolName: McpToolName;
  readonly input: Readonly<Record<string, unknown>>;
}

export interface McpToolExecutor {
  execute(request: McpToolExecutionRequest): Promise<unknown>;
}

export interface McpHttpEndpointDependencies {
  readonly authenticator: McpRequestAuthenticator;
  readonly toolExecutor: McpToolExecutor;
}

export interface McpHttpEndpoint {
  fetch(request: Request): Promise<Response>;
}

export class McpAuthenticationError extends Error {
  public constructor(message = "MCP Access Tokenが無効です") {
    super(message);
    this.name = "McpAuthenticationError";
  }
}

const actionByErrorCode: Readonly<Record<CreateScheduleErrorCode, string>> = {
  INVALID_DATETIME: "ASK_USER",
  INVALID_DESTINATION: "REFETCH_SCHEDULE_CONTEXT",
  DESTINATION_DISABLED: "REFETCH_SCHEDULE_CONTEXT",
  NO_WRITABLE_CALENDAR: "OPEN_SCHEDULE_HUB_SETTINGS",
  PROVIDER_AUTH_EXPIRED: "RECONNECT_CALENDAR_PROVIDER",
  PROVIDER_API_ERROR: "RETRY",
  OPERATION_ID_CONFLICT: "GENERATE_NEW_OPERATION_ID",
  OPERATION_IN_PROGRESS: "RETRY",
};

export function createMcpHttpEndpoint(
  dependencies: McpHttpEndpointDependencies,
): McpHttpEndpoint {
  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname !== "/mcp") {
        return Response.json(
          { error: { code: "NOT_FOUND", message: "Endpointが見つかりません" } },
          { status: 404 },
        );
      }
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", {
          status: 405,
          headers: { Allow: "POST" },
        });
      }

      let authentication: AuthenticatedMcpRequest;
      try {
        authentication = await dependencies.authenticator.authenticate(request);
      } catch {
        return Response.json(
          {
            error: {
              code: "UNAUTHORIZED",
              message: "MCP Access Tokenを確認してください",
            },
          },
          {
            status: 401,
            headers: { "WWW-Authenticate": "Bearer" },
          },
        );
      }

      return handleMcpRequest(
        request,
        toAuthInfo(authentication),
        dependencies.toolExecutor,
      );
    },
  };
}

async function handleMcpRequest(
  request: Request,
  authInfo: AuthInfo,
  toolExecutor: McpToolExecutor,
): Promise<Response> {
  const server = createServer(toolExecutor, requireUserId(authInfo));
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request, { authInfo });
  } finally {
    await transport.close();
  }
}
function createServer(
  toolExecutor: McpToolExecutor,
  userId: string,
): McpServer {
  const server = new McpServer({ name: "schedule-hub", version: "0.1.0" });
  const getContextDefinition = mcpToolDefinitions[0];
  const createScheduleDefinition = mcpToolDefinitions[1];

  server.registerTool(
    getContextDefinition.name,
    {
      title: getContextDefinition.title,
      description: getContextDefinition.description,
      inputSchema: fromJsonSchema<Readonly<Record<string, unknown>>>(
        getScheduleContextInputSchema,
      ),
      outputSchema: fromJsonSchema<Readonly<Record<string, unknown>>>(
        getScheduleContextOutputSchema,
      ),
      annotations: getContextDefinition.annotations,
    },
    (input) =>
      executeTool(toolExecutor, {
        userId,
        toolName: "get_schedule_context",
        input,
      }),
  );

  server.registerTool(
    createScheduleDefinition.name,
    {
      title: createScheduleDefinition.title,
      description: createScheduleDefinition.description,
      inputSchema: fromJsonSchema<Readonly<Record<string, unknown>>>(
        createScheduleInputSchema,
      ),
      outputSchema: fromJsonSchema<Readonly<Record<string, unknown>>>(
        createScheduleOutputSchema,
      ),
      annotations: createScheduleDefinition.annotations,
    },
    (input) =>
      executeTool(toolExecutor, {
        userId,
        toolName: "create_schedule",
        input,
      }),
  );

  return server;
}

async function executeTool(
  executor: McpToolExecutor,
  request: McpToolExecutionRequest,
) {
  try {
    const output = await executor.execute(request);
    if (
      !isStructuredContent(output) ||
      !validateMcpToolOutput(request.toolName, output).success
    ) {
      throw new Error("Tool出力がSchemaに適合しません");
    }
    return {
      content: [{ type: "text" as const, text: JSON.stringify(output) }],
      structuredContent: output,
      isError: false,
    };
  } catch (error: unknown) {
    const businessError = toBusinessError(error);
    const structuredContent = { error: businessError };
    return {
      content: [{ type: "text" as const, text: businessError.message }],
      structuredContent,
      isError: true,
    };
  }
}

function isStructuredContent(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function toBusinessError(error: unknown): {
  readonly code: CreateScheduleErrorCode;
  readonly message: string;
  readonly action: string;
} {
  if (error instanceof CreateScheduleError) {
    return {
      code: error.code,
      message: error.message,
      action: actionByErrorCode[error.code],
    };
  }
  return {
    code: "PROVIDER_API_ERROR",
    message: "一時的に予定処理を完了できませんでした。",
    action: "RETRY",
  };
}

function toAuthInfo(authentication: AuthenticatedMcpRequest): AuthInfo {
  return {
    token: authentication.token,
    clientId: authentication.clientId,
    scopes: [...authentication.scopes],
    ...(authentication.expiresAt === undefined
      ? {}
      : { expiresAt: authentication.expiresAt }),
    ...(authentication.resource === undefined
      ? {}
      : { resource: authentication.resource }),
    extra: { userId: authentication.userId },
  };
}

function requireUserId(authInfo: AuthInfo | undefined): string {
  const userId = authInfo?.extra?.userId;
  if (typeof userId !== "string" || userId.length === 0) {
    throw new McpAuthenticationError();
  }
  return userId;
}
