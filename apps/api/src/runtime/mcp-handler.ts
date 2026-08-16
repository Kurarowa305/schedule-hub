import { createMcpHttpEndpoint } from "../presentation/mcp/mcp-http-endpoint.js";
import {
  jwtClaims,
  toRequest,
  toResult,
  type HttpApiEvent,
} from "./lambda-http.js";
import { productionMcpToolExecutor } from "./production-mcp.js";

export async function handler(event: HttpApiEvent) {
  if (event.rawPath.startsWith("/.well-known/oauth-protected-resource")) {
    const resource =
      process.env.MCP_RESOURCE ?? "https://schedule-hub.invalid/mcp";
    return toResult(
      Response.json({
        resource,
        authorization_servers: [
          `https://${requireEnvironment("COGNITO_DOMAIN")}`,
        ],
        scopes_supported: ["schedule-hub-mcp/use"],
        bearer_methods_supported: ["header"],
      }),
    );
  }
  const claims = jwtClaims(event);
  const endpoint = createMcpHttpEndpoint({
    authenticator: {
      async authenticate(request) {
        const token = request.headers
          .get("authorization")
          ?.replace(/^Bearer\s+/i, "");
        if (!token || !claims.sub) throw new Error("認証情報がありません");
        return {
          userId: claims.sub,
          token,
          clientId: claims.client_id ?? requireEnvironment("MCP_CLIENT_ID"),
          scopes: (claims.scope ?? "").split(" ").filter(Boolean),
          expiresAt: Number(claims.exp),
        };
      },
    },
    toolExecutor: productionMcpToolExecutor(),
  });
  return toResult(await endpoint.fetch(toRequest(event)));
}

function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name}が設定されていません`);
  return value;
}
