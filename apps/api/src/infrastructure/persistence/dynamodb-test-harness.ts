import { CreateTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import dynalite from "dynalite";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { DynamoDbScheduleHubRepository } from "./dynamodb-schedule-hub-repository.js";

export interface DynamoDbTestContext {
  readonly repository: DynamoDbScheduleHubRepository;
  close(): Promise<void>;
}

export async function createDynamoDbTestContext(): Promise<DynamoDbTestContext> {
  const tableName = "ScheduleHubTest";
  const server = dynalite({ createTableMs: 0 });
  await listen(server);
  const port = (server.address() as AddressInfo).port;
  const lowLevelClient = new DynamoDBClient({
    endpoint: `http://127.0.0.1:${port}`,
    region: "ap-northeast-1",
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
  });
  const documentClient = DynamoDBDocumentClient.from(lowLevelClient);
  await lowLevelClient.send(
    new CreateTableCommand({
      TableName: tableName,
      BillingMode: "PAY_PER_REQUEST",
      KeySchema: [
        { AttributeName: "PK", KeyType: "HASH" },
        { AttributeName: "SK", KeyType: "RANGE" },
      ],
      AttributeDefinitions: [
        { AttributeName: "PK", AttributeType: "S" },
        { AttributeName: "SK", AttributeType: "S" },
        { AttributeName: "GSI1PK", AttributeType: "S" },
        { AttributeName: "GSI1SK", AttributeType: "S" },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: "GSI1",
          KeySchema: [
            { AttributeName: "GSI1PK", KeyType: "HASH" },
            { AttributeName: "GSI1SK", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    }),
  );

  return {
    repository: new DynamoDbScheduleHubRepository(documentClient, tableName),
    async close(): Promise<void> {
      documentClient.destroy();
      lowLevelClient.destroy();
      await close(server);
    },
  };
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
