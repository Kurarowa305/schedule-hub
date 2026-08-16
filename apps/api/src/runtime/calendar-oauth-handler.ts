import { createWebRestApiEndpoint } from "../presentation/rest/web-rest-api-endpoint.js";
import {
  jwtClaims,
  toRequest,
  toResult,
  type HttpApiEvent,
} from "./lambda-http.js";
import { productionCalendarOAuthExecutor } from "./production-calendar-oauth.js";

export async function handler(event: HttpApiEvent) {
  const claims = jwtClaims(event);
  const endpoint = createWebRestApiEndpoint({
    authenticator: {
      async authenticate() {
        if (!claims.sub) throw new Error("認証情報がありません");
        return { userId: claims.sub };
      },
    },
    executor: productionCalendarOAuthExecutor(),
  });
  return toResult(await endpoint.fetch(toRequest(event)));
}
