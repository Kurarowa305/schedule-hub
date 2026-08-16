import {
  BatchGetCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type {
  LogicalDestination,
  PhysicalCalendar,
} from "@schedule-hub/shared";
import type {
  BeginCreateScheduleCommand,
  BeginCreateScheduleResult,
  CalendarConnection,
  CreateScheduleStore,
  StoredCalendarExecutionResult,
} from "../../application/ports/create-schedule-store.js";
import type { CalendarCredentialUpdate } from "../../application/ports/calendar-provider.js";
import type { CreateScheduleResult } from "../../application/create-schedule/create-schedule-contract.js";
import { DynamoDbScheduleHubRepository } from "./dynamodb-schedule-hub-repository.js";

interface OperationItem {
  readonly PK: string;
  readonly SK: "META";
  readonly entityType: "CreateOperation";
  readonly GSI1PK: string;
  readonly GSI1SK: string;
  readonly operationId: string;
  readonly userId: string;
  readonly payloadHash: string;
  readonly physicalCalendarIds: readonly string[];
  readonly status: "PROCESSING" | "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";
  readonly leaseExpiresAt: string | null;
  readonly createdAt: string;
  readonly result?: CreateScheduleResult;
}

interface EventItem extends StoredCalendarExecutionResult {
  readonly PK: string;
  readonly SK: string;
  readonly entityType: "ExternalEvent";
  readonly createdAt: string;
}

export class DynamoDbProductionStore
  extends DynamoDbScheduleHubRepository
  implements CreateScheduleStore
{
  public constructor(
    private readonly documentClient: DynamoDBDocumentClient,
    private readonly productionTableName: string,
  ) {
    super(documentClient, productionTableName);
  }

  public async getLogicalDestinations(
    userId: string,
    destinationIds: readonly string[],
  ): Promise<readonly LogicalDestination[]> {
    return this.batchGet(
      userId,
      destinationIds.map((id) => `DEST#${id}`),
    );
  }

  public async getPhysicalCalendars(
    userId: string,
    physicalCalendarIds: readonly string[],
  ): Promise<readonly PhysicalCalendar[]> {
    return this.batchGet(
      userId,
      physicalCalendarIds.map((id) => `PCAL#${id}`),
    );
  }

  public async getCalendarConnections(
    userId: string,
    connectionIds: readonly string[],
  ): Promise<readonly CalendarConnection[]> {
    const items = await this.batchGet<Record<string, unknown>>(
      userId,
      connectionIds.map((id) => `CONN#${id}`),
    );
    return items.map((item) => ({
      connectionId: String(item.connectionId),
      provider: "GOOGLE",
      status: item.status as CalendarConnection["status"],
      credentials: {
        accessToken: String(item.accessToken),
        refreshToken: String(item.refreshToken),
        accessTokenExpiresAt: Number(item.accessTokenExpiresAt),
      },
    }));
  }

  public async beginCreateSchedule(
    command: BeginCreateScheduleCommand,
  ): Promise<BeginCreateScheduleResult> {
    const existing = await this.getOperationItem(command.operationId);
    if (existing === null) {
      const item: OperationItem = {
        PK: operationPk(command.operationId),
        SK: "META",
        entityType: "CreateOperation",
        GSI1PK: userPk(command.userId),
        GSI1SK: `OP#${command.createdAt}#${command.operationId}`,
        operationId: command.operationId,
        userId: command.userId,
        payloadHash: command.payloadHash,
        physicalCalendarIds: command.physicalCalendarIds,
        status: "PROCESSING",
        leaseExpiresAt: command.leaseExpiresAt,
        createdAt: command.createdAt,
      };
      try {
        await this.documentClient.send(
          new PutCommand({
            TableName: this.productionTableName,
            Item: item,
            ConditionExpression: "attribute_not_exists(PK)",
          }),
        );
        return {
          kind: "EXECUTE",
          physicalCalendarIds: command.physicalCalendarIds,
          existingResults: [],
        };
      } catch (error: unknown) {
        if (!isConditionalCheckFailure(error)) throw error;
        return this.beginCreateSchedule(command);
      }
    }
    if (
      existing.payloadHash !== command.payloadHash ||
      existing.userId !== command.userId
    ) {
      return { kind: "CONFLICT" };
    }
    if (existing.status === "SUCCESS" && existing.result !== undefined) {
      return { kind: "REPLAY", result: existing.result };
    }
    if (
      existing.status === "PROCESSING" &&
      existing.leaseExpiresAt !== null &&
      Date.parse(existing.leaseExpiresAt) > Date.parse(command.createdAt)
    ) {
      return { kind: "IN_PROGRESS" };
    }
    const existingResults = await this.listExecutionResults(
      command.operationId,
    );
    const succeeded = new Set(
      existingResults
        .filter(({ status }) => status === "SUCCESS")
        .map(({ physicalCalendarId }) => physicalCalendarId),
    );
    const retryIds = command.physicalCalendarIds.filter(
      (id) => !succeeded.has(id),
    );
    await this.documentClient.send(
      new UpdateCommand({
        TableName: this.productionTableName,
        Key: { PK: operationPk(command.operationId), SK: "META" },
        UpdateExpression: "SET #status = :processing, leaseExpiresAt = :lease",
        ConditionExpression: "payloadHash = :payloadHash",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":processing": "PROCESSING",
          ":lease": command.leaseExpiresAt,
          ":payloadHash": command.payloadHash,
        },
      }),
    );
    return { kind: "EXECUTE", physicalCalendarIds: retryIds, existingResults };
  }

  public async saveCalendarExecutionResult(
    result: StoredCalendarExecutionResult,
  ): Promise<void> {
    const item: EventItem = {
      PK: operationPk(result.operationId),
      SK: `EVENT#${result.physicalCalendarId}`,
      entityType: "ExternalEvent",
      createdAt: new Date().toISOString(),
      ...result,
    };
    await this.documentClient.send(
      new PutCommand({ TableName: this.productionTableName, Item: item }),
    );
  }

  public async completeCreateSchedule(
    result: CreateScheduleResult,
  ): Promise<void> {
    await this.documentClient.send(
      new UpdateCommand({
        TableName: this.productionTableName,
        Key: { PK: operationPk(result.operationId), SK: "META" },
        UpdateExpression:
          "SET #status = :status, leaseExpiresAt = :empty, #result = :result, title = :title, #start = :start, #end = :end, destinationIds = :destinationIds",
        ExpressionAttributeNames: {
          "#status": "status",
          "#result": "result",
          "#start": "start",
          "#end": "end",
        },
        ExpressionAttributeValues: {
          ":status": result.status,
          ":empty": null,
          ":result": { ...result, replayed: false },
          ":title": result.schedule.title,
          ":start": result.schedule.start,
          ":end": result.schedule.end,
          ":destinationIds": result.destinations.map(({ id }) => id),
        },
      }),
    );
  }

  public async updateCalendarConnectionCredentials(
    userId: string,
    connectionId: string,
    update: CalendarCredentialUpdate,
  ): Promise<void> {
    await this.documentClient.send(
      new UpdateCommand({
        TableName: this.productionTableName,
        Key: { PK: userPk(userId), SK: `CONN#${connectionId}` },
        UpdateExpression:
          "SET accessToken = :token, accessTokenExpiresAt = :expiresAt, updatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":token": update.accessToken,
          ":expiresAt": update.accessTokenExpiresAt,
          ":updatedAt": new Date().toISOString(),
        },
      }),
    );
  }

  public async markCalendarConnectionReauthRequired(
    userId: string,
    connectionId: string,
  ): Promise<void> {
    await this.documentClient.send(
      new UpdateCommand({
        TableName: this.productionTableName,
        Key: { PK: userPk(userId), SK: `CONN#${connectionId}` },
        UpdateExpression: "SET #status = :status, updatedAt = :updatedAt",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":status": "REAUTH_REQUIRED",
          ":updatedAt": new Date().toISOString(),
        },
      }),
    );
  }

  private async batchGet<T>(
    userId: string,
    sortKeys: readonly string[],
  ): Promise<T[]> {
    if (sortKeys.length === 0) return [];
    const result = await this.documentClient.send(
      new BatchGetCommand({
        RequestItems: {
          [this.productionTableName]: {
            Keys: sortKeys.map((SK) => ({ PK: userPk(userId), SK })),
            ConsistentRead: true,
          },
        },
      }),
    );
    return (result.Responses?.[this.productionTableName] ?? []) as T[];
  }

  private async getOperationItem(
    operationId: string,
  ): Promise<OperationItem | null> {
    const result = await this.documentClient.send(
      new GetCommand({
        TableName: this.productionTableName,
        Key: { PK: operationPk(operationId), SK: "META" },
        ConsistentRead: true,
      }),
    );
    return (result.Item as OperationItem | undefined) ?? null;
  }

  private async listExecutionResults(
    operationId: string,
  ): Promise<StoredCalendarExecutionResult[]> {
    const result = await this.documentClient.send(
      new QueryCommand({
        TableName: this.productionTableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
        ExpressionAttributeValues: {
          ":pk": operationPk(operationId),
          ":prefix": "EVENT#",
        },
        ConsistentRead: true,
      }),
    );
    return (result.Items ?? []).map((item) => {
      const event = item as EventItem;
      return {
        operationId: event.operationId,
        physicalCalendarId: event.physicalCalendarId,
        provider: event.provider,
        status: event.status,
        externalEventId: event.externalEventId,
        errorCode: event.errorCode,
      };
    });
  }
}

function userPk(userId: string): string {
  return `USER#${userId}`;
}

function operationPk(operationId: string): string {
  return `OP#${operationId}`;
}

function isConditionalCheckFailure(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "ConditionalCheckFailedException"
  );
}
