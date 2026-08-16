import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { CalendarOAuthService } from "../application/calendar-oauth/calendar-oauth-service.js";
import { CalendarSyncService } from "../application/calendar-sync/calendar-sync-service.js";
import { GoogleCalendarCatalogAdapter } from "../infrastructure/google/google-calendar-catalog-adapter.js";
import { GoogleCalendarHttpApi } from "../infrastructure/google/google-calendar-http-api.js";
import { GoogleCalendarOAuthHttpAdapter } from "../infrastructure/google/google-calendar-oauth-http.js";
import { DynamoDbProductionStore } from "../infrastructure/persistence/dynamodb-production-store.js";
import { createCalendarOAuthExecutor } from "./calendar-oauth-executor.js";

let singleton: ReturnType<typeof createCalendarOAuthExecutor> | undefined;

export function productionCalendarOAuthExecutor() {
  if (singleton !== undefined) return singleton;
  const clientId = requireEnvironment("GOOGLE_CALENDAR_CLIENT_ID");
  const clientSecret = requireEnvironment("GOOGLE_CALENDAR_CLIENT_SECRET");
  const store = new DynamoDbProductionStore(
    DynamoDBDocumentClient.from(new DynamoDBClient({})),
    requireEnvironment("TABLE_NAME"),
  );
  const googleApi = new GoogleCalendarHttpApi({ clientId, clientSecret });
  singleton = createCalendarOAuthExecutor({
    oauth: new CalendarOAuthService({
      store,
      provider: new GoogleCalendarOAuthHttpAdapter({
        clientId,
        clientSecret,
        redirectUri: requireEnvironment("GOOGLE_CALENDAR_REDIRECT_URI"),
      }),
    }),
    sync: new CalendarSyncService({
      store,
      provider: new GoogleCalendarCatalogAdapter(googleApi),
    }),
    webBaseUrl: requireEnvironment("WEB_BASE_URL"),
  });
  return singleton;
}

function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name}が設定されていません`);
  return value;
}
