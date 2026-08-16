import { CreateTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {
  createLogicalDestination,
  createPhysicalCalendar,
  createUserPreference,
} from "@schedule-hub/shared";
import dynalite from "dynalite";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CreateScheduleService } from "../../application/create-schedule/create-schedule-service.js";
import { baseInput } from "../../application/create-schedule/create-schedule-test-fixture.js";
import { DynamoDbProductionStore } from "./dynamodb-production-store.js";

const tableName = "ScheduleHubProductionStoreTest";
const server = dynalite({ createTableMs: 0 });
let lowLevelClient: DynamoDBClient;
let documentClient: DynamoDBDocumentClient;
let store: DynamoDbProductionStore;

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
      ],
    }),
  );
  store = new DynamoDbProductionStore(documentClient, tableName);
});

afterAll(async () => {
  documentClient.destroy();
  lowLevelClient.destroy();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

describe("DynamoDB本番CreateScheduleStore", () => {
  it("予定を保存し、同一operationId再送ではGoogleへ二重登録しない", async () => {
    await store.putUserPreference(
      "user-1",
      createUserPreference({
        timezone: "Asia/Tokyo",
        defaultDurationMinutes: 60,
        defaultDestinationIds: ["work"],
      }),
    );
    await store.putLogicalDestination(
      "user-1",
      createLogicalDestination({
        destinationId: "work",
        name: "仕事",
        aliases: ["work"],
        description: "仕事用",
        physicalCalendarIds: ["pcal-work"],
        enabled: true,
      }),
    );
    await store.putCalendarConnection("user-1", {
      connectionId: "conn-google",
      provider: "GOOGLE",
      accountIdentifier: "test@example.com",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      accessTokenExpiresAt: 2_000_000_000,
      status: "ACTIVE",
      createdAt: "2026-08-16T00:00:00.000Z",
      updatedAt: "2026-08-16T00:00:00.000Z",
    });
    await store.putPhysicalCalendar("user-1", {
      ...createPhysicalCalendar({
        physicalCalendarId: "pcal-work",
        provider: "GOOGLE",
        connectionId: "conn-google",
        externalCalendarId: "work@example.com",
        name: "仕事",
        accessRole: "owner",
        writable: true,
        status: "ACTIVE",
        eventColorId: null,
      }),
      createdAt: "2026-08-16T00:00:00.000Z",
      updatedAt: "2026-08-16T00:00:00.000Z",
    });
    const createEvent = vi.fn(async () => ({
      externalEventId: "google-event-1",
      credentialUpdate: null,
    }));
    const service = new CreateScheduleService(
      store,
      { GOOGLE: { createEvent } },
      { now: () => new Date("2026-08-16T00:00:00.000Z") },
    );

    const first = await service.execute({ userId: "user-1", input: baseInput });
    const replay = await service.execute({
      userId: "user-1",
      input: baseInput,
    });

    expect(first.status).toBe("SUCCESS");
    expect(replay).toEqual({ ...first, replayed: true });
    expect(createEvent).toHaveBeenCalledOnce();
  });
});
