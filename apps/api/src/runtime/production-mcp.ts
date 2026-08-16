import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { CreateScheduleService } from "../application/create-schedule/create-schedule-service.js";
import { GetScheduleContextService } from "../application/get-schedule-context/get-schedule-context-service.js";
import { GoogleCalendarAdapter } from "../infrastructure/google/google-calendar-adapter.js";
import { GoogleCalendarHttpApi } from "../infrastructure/google/google-calendar-http-api.js";
import { DynamoDbProductionStore } from "../infrastructure/persistence/dynamodb-production-store.js";
import { createMcpToolExecutor } from "./mcp-tool-executor.js";

let singleton: ReturnType<typeof createMcpToolExecutor> | undefined;

export function productionMcpToolExecutor() {
  singleton ??= createProductionMcpToolExecutor();
  return singleton;
}

export function createProductionMcpToolExecutor() {
  const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const store = new DynamoDbProductionStore(
    documentClient,
    requireEnvironment("TABLE_NAME"),
  );
  const googleApi = new GoogleCalendarHttpApi({
    clientId: requireEnvironment("GOOGLE_CALENDAR_CLIENT_ID"),
    clientSecret: requireEnvironment("GOOGLE_CALENDAR_CLIENT_SECRET"),
  });
  return createMcpToolExecutor({
    getScheduleContext: new GetScheduleContextService({ store }),
    createSchedule: new CreateScheduleService(store, {
      GOOGLE: new GoogleCalendarAdapter(googleApi),
    }),
  });
}

function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name}が設定されていません`);
  return value;
}
