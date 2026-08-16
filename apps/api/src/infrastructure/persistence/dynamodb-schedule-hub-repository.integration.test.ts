import { CreateTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import dynalite from "dynalite";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DynamoDbScheduleHubRepository } from "./dynamodb-schedule-hub-repository.js";

const tableName = "ScheduleHubTest";
const server = dynalite({ createTableMs: 0 });
let lowLevelClient: DynamoDBClient;
let documentClient: DynamoDBDocumentClient;

beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = (server.address() as AddressInfo).port;
  lowLevelClient = new DynamoDBClient({
    endpoint: `http://127.0.0.1:${port}`,
    region: "ap-northeast-1",
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
  });
  documentClient = DynamoDBDocumentClient.from(lowLevelClient);
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
});

afterAll(async () => {
  documentClient?.destroy();
  lowLevelClient?.destroy();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

describe("DynamoDbScheduleHubRepository", () => {
  it("CreateOperationを条件付きPutして上書きしない", async () => {
    const repository = new DynamoDbScheduleHubRepository(
      documentClient,
      tableName,
    );
    const operation = {
      operationId: "operation-conditional",
      userId: "user-1",
      payloadHash: "sha256:payload-a",
      status: "PROCESSING" as const,
      leaseExpiresAt: "2026-08-14T09:01:00.000Z",
      createdAt: "2026-08-14T09:00:00.000Z",
    };

    await expect(
      repository.putCreateOperationIfAbsent(operation),
    ).resolves.toBe(true);
    await expect(
      repository.putCreateOperationIfAbsent({
        ...operation,
        payloadHash: "sha256:different",
      }),
    ).resolves.toBe(false);
    await expect(
      repository.getCreateOperation(operation.operationId),
    ).resolves.toEqual(operation);
  });
});
