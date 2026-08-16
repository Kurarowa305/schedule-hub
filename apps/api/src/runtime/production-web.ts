import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DynamoDbWebApplicationStore } from "../infrastructure/persistence/dynamodb-web-application-store.js";
import { createWebRestExecutor } from "./web-rest-executor.js";

let singleton: ReturnType<typeof createWebRestExecutor> | undefined;

export function productionWebRestExecutor() {
  singleton ??= createWebRestExecutor({
    store: new DynamoDbWebApplicationStore(
      DynamoDBDocumentClient.from(new DynamoDBClient({})),
      requireEnvironment("TABLE_NAME"),
    ),
  });
  return singleton;
}

function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name}が設定されていません`);
  return value;
}
