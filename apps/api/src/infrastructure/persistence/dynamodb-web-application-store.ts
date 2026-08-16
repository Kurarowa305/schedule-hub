import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import type {
  LogicalDestination,
  PhysicalCalendar,
  UserPreference,
} from "@schedule-hub/shared";
import type { StoredCalendarConnection } from "../../application/ports/schedule-hub-repository.js";
import type {
  ExternalDisplayTargetRecord,
  OperationDetail,
  OperationSummary,
  WebApplicationStore,
} from "../../runtime/web-rest-executor.js";
import { DynamoDbScheduleHubRepository } from "./dynamodb-schedule-hub-repository.js";

export class DynamoDbWebApplicationStore implements WebApplicationStore {
  readonly #repository: DynamoDbScheduleHubRepository;

  public constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {
    this.#repository = new DynamoDbScheduleHubRepository(client, tableName);
  }

  public getUserPreference(userId: string) {
    return this.#repository.getUserPreference(userId);
  }

  public putUserPreference(userId: string, preference: UserPreference) {
    return this.#repository.putUserPreference(userId, preference);
  }

  public async listConnections(
    userId: string,
  ): Promise<readonly StoredCalendarConnection[]> {
    return (await this.queryUserPrefix(
      userId,
      "CONN#",
    )) as unknown as StoredCalendarConnection[];
  }

  public async disconnectConnection(
    userId: string,
    connectionId: string,
  ): Promise<void> {
    const connection = await this.#repository.getCalendarConnection(
      userId,
      connectionId,
    );
    if (connection === null) return;
    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { PK: userPk(userId), SK: `CONN#${connectionId}` },
      }),
    );
    const calendars = await this.listPhysicalCalendars(userId);
    await Promise.all(
      calendars
        .filter((calendar) => calendar.connectionId === connectionId)
        .map((calendar) =>
          this.putPhysicalCalendar(userId, {
            ...calendar,
            writable: false,
            status: "DELETED",
          }),
        ),
    );
  }

  public async listPhysicalCalendars(
    userId: string,
  ): Promise<readonly PhysicalCalendar[]> {
    return (await this.queryUserPrefix(
      userId,
      "PCAL#",
    )) as unknown as PhysicalCalendar[];
  }

  public async putPhysicalCalendar(
    userId: string,
    calendar: PhysicalCalendar,
  ): Promise<void> {
    const now = new Date().toISOString();
    const existing = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: userPk(userId), SK: "PCAL#" + calendar.physicalCalendarId },
        ConsistentRead: true,
      }),
    );
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: userPk(userId),
          SK: `PCAL#${calendar.physicalCalendarId}`,
          entityType: "PhysicalCalendar",
          ...calendar,
          createdAt:
            typeof existing.Item?.createdAt === "string"
              ? existing.Item.createdAt
              : now,
          updatedAt: now,
        },
      }),
    );
  }

  public listLogicalDestinations(
    userId: string,
    limit: number,
    cursor?: string,
  ) {
    return this.#repository.listLogicalDestinations(userId, limit, cursor);
  }

  public async getLogicalDestination(
    userId: string,
    destinationId: string,
  ): Promise<LogicalDestination | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: userPk(userId), SK: `DEST#${destinationId}` },
        ConsistentRead: true,
      }),
    );
    return (result.Item as LogicalDestination | undefined) ?? null;
  }

  public putLogicalDestination(
    userId: string,
    destination: LogicalDestination,
  ) {
    return this.#repository.putLogicalDestination(userId, destination);
  }

  public async listDisplayTargets(
    userId: string,
  ): Promise<readonly ExternalDisplayTargetRecord[]> {
    return (await this.queryUserPrefix(
      userId,
      "DISPLAY#",
    )) as unknown as ExternalDisplayTargetRecord[];
  }

  public async putDisplayTarget(
    userId: string,
    target: ExternalDisplayTargetRecord,
  ): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: userPk(userId),
          SK: `DISPLAY#${target.target}`,
          entityType: "ExternalDisplayTarget",
          ...target,
        },
      }),
    );
  }

  public async listOperations(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<{
    readonly items: readonly OperationSummary[];
    readonly nextCursor: string | null;
  }> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": userPk(userId) },
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey:
          cursor === undefined ? undefined : decodeCursor(cursor),
      }),
    );
    return {
      items: (result.Items ?? []).map(toOperationSummary),
      nextCursor:
        result.LastEvaluatedKey === undefined
          ? null
          : encodeCursor(result.LastEvaluatedKey),
    };
  }

  public async getOperationDetail(
    userId: string,
    operationId: string,
  ): Promise<OperationDetail | null> {
    const operationResult = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: `OP#${operationId}`, SK: "META" },
        ConsistentRead: true,
      }),
    );
    if (operationResult.Item?.userId !== userId) return null;
    const operation = toOperationSummary(operationResult.Item);
    const eventsResult = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
        ExpressionAttributeValues: {
          ":pk": `OP#${operationId}`,
          ":prefix": "EVENT#",
        },
        ConsistentRead: true,
      }),
    );
    return {
      operationId: operation.operationId,
      title: operation.title,
      start: operation.start,
      end: operation.end,
      destinationIds: operation.destinationIds,
      status: operation.status,
      createdAt: operation.createdAt,
      timezone:
        typeof operationResult.Item.result?.schedule?.timezone === "string"
          ? operationResult.Item.result.schedule.timezone
          : "Asia/Tokyo",
      events: (eventsResult.Items ?? []).map((item) => ({
        physicalCalendarId: String(item.physicalCalendarId),
        status: item.status as "SUCCESS" | "FAILED",
        errorCode: typeof item.errorCode === "string" ? item.errorCode : null,
      })),
    };
  }

  private async queryUserPrefix(
    userId: string,
    prefix: string,
  ): Promise<Record<string, unknown>[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
        ExpressionAttributeValues: { ":pk": userPk(userId), ":prefix": prefix },
        ConsistentRead: true,
      }),
    );
    return result.Items ?? [];
  }
}

function toOperationSummary(item: Record<string, unknown>): OperationSummary {
  return {
    operationId: String(item.operationId),
    userId: String(item.userId),
    title: typeof item.title === "string" ? item.title : "",
    start: typeof item.start === "string" ? item.start : "",
    end: typeof item.end === "string" ? item.end : "",
    destinationIds: Array.isArray(item.destinationIds)
      ? item.destinationIds
      : [],
    status: item.status as OperationSummary["status"],
    createdAt: String(item.createdAt),
  };
}

function userPk(userId: string): string {
  return `USER#${userId}`;
}

function encodeCursor(key: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(key), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): Record<string, string> {
  try {
    const value = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as unknown;
    if (typeof value !== "object" || value === null)
      throw new Error("invalid cursor");
    return value as Record<string, string>;
  } catch {
    throw new Error("INVALID_CURSOR");
  }
}
