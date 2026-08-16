import type { LogicalDestination, UserPreference } from "@schedule-hub/shared";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import type {
  Page,
  ScheduleHubRepository,
  StoredCalendarConnection,
  StoredCreateOperation,
  StoredOAuthState,
} from "../../application/ports/schedule-hub-repository.js";

interface CreateOperationItem extends StoredCreateOperation {
  readonly PK: string;
  readonly SK: "META";
  readonly entityType: "CreateOperation";
  readonly GSI1PK: string;
  readonly GSI1SK: string;
}

interface UserPreferenceItem extends UserPreference {
  readonly PK: string;
  readonly SK: "PROFILE";
  readonly entityType: "User";
}

interface LogicalDestinationItem extends LogicalDestination {
  readonly PK: string;
  readonly SK: string;
  readonly entityType: "LogicalDestination";
}

interface OAuthStateItem extends StoredOAuthState {
  readonly PK: string;
  readonly SK: "META";
  readonly entityType: "OAuthState";
}

interface CalendarConnectionItem extends StoredCalendarConnection {
  readonly PK: string;
  readonly SK: string;
  readonly entityType: "CalendarConnection";
}

export class DynamoDbScheduleHubRepository implements ScheduleHubRepository {
  public constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  public async putCreateOperationIfAbsent(
    operation: StoredCreateOperation,
  ): Promise<boolean> {
    const item: CreateOperationItem = {
      PK: operationPk(operation.operationId),
      SK: "META",
      entityType: "CreateOperation",
      GSI1PK: userPk(operation.userId),
      GSI1SK: `OP#${operation.createdAt}#${operation.operationId}`,
      ...operation,
    };

    try {
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
          ConditionExpression: "attribute_not_exists(PK)",
        }),
      );
      return true;
    } catch (error: unknown) {
      if (isConditionalCheckFailure(error)) {
        return false;
      }
      throw error;
    }
  }

  public async getCreateOperation(
    operationId: string,
  ): Promise<StoredCreateOperation | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: operationPk(operationId), SK: "META" },
        ConsistentRead: true,
      }),
    );
    if (result.Item === undefined) {
      return null;
    }
    return toStoredCreateOperation(result.Item as CreateOperationItem);
  }

  public async putUserPreference(
    userId: string,
    preference: UserPreference,
  ): Promise<void> {
    const item: UserPreferenceItem = {
      PK: userPk(userId),
      SK: "PROFILE",
      entityType: "User",
      ...preference,
    };
    await this.client.send(
      new PutCommand({ TableName: this.tableName, Item: item }),
    );
  }

  public async getUserPreference(
    userId: string,
  ): Promise<UserPreference | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: userPk(userId), SK: "PROFILE" },
        ConsistentRead: true,
      }),
    );
    if (result.Item === undefined) {
      return null;
    }
    const item = result.Item as UserPreferenceItem;
    return {
      timezone: item.timezone,
      defaultDurationMinutes: item.defaultDurationMinutes,
      defaultDestinationIds: item.defaultDestinationIds,
    };
  }

  public async putLogicalDestination(
    userId: string,
    destination: LogicalDestination,
  ): Promise<void> {
    const item: LogicalDestinationItem = {
      PK: userPk(userId),
      SK: destinationSk(destination.destinationId),
      entityType: "LogicalDestination",
      ...destination,
    };
    await this.client.send(
      new PutCommand({ TableName: this.tableName, Item: item }),
    );
  }

  public async listLogicalDestinations(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<Page<LogicalDestination>> {
    assertLimit(limit);
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
        ExpressionAttributeValues: {
          ":pk": userPk(userId),
          ":prefix": "DEST#",
        },
        Limit: limit,
        ExclusiveStartKey:
          cursor === undefined ? undefined : decodeCursor(cursor),
      }),
    );
    return {
      items: (result.Items ?? []).map((item) =>
        toLogicalDestination(item as LogicalDestinationItem),
      ),
      nextCursor:
        result.LastEvaluatedKey === undefined
          ? null
          : encodeCursor(result.LastEvaluatedKey),
    };
  }

  public async listRecentCreateOperations(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<Page<StoredCreateOperation>> {
    assertLimit(limit);
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
      items: (result.Items ?? []).map((item) =>
        toStoredCreateOperation(item as CreateOperationItem),
      ),
      nextCursor:
        result.LastEvaluatedKey === undefined
          ? null
          : encodeCursor(result.LastEvaluatedKey),
    };
  }

  public async putOAuthState(state: StoredOAuthState): Promise<void> {
    const item: OAuthStateItem = {
      PK: oauthStatePk(state.state),
      SK: "META",
      entityType: "OAuthState",
      ...state,
    };
    await this.client.send(
      new PutCommand({ TableName: this.tableName, Item: item }),
    );
  }

  public async getOAuthState(state: string): Promise<StoredOAuthState | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: oauthStatePk(state), SK: "META" },
        ConsistentRead: true,
      }),
    );
    if (result.Item === undefined) {
      return null;
    }
    const item = result.Item as OAuthStateItem;
    return {
      state: item.state,
      userId: item.userId,
      provider: item.provider,
      purpose: item.purpose,
      createdAt: item.createdAt,
      ttl: item.ttl,
    };
  }
  public async takeOAuthState(state: string): Promise<StoredOAuthState | null> {
    const result = await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { PK: oauthStatePk(state), SK: "META" },
        ReturnValues: "ALL_OLD",
      }),
    );
    if (result.Attributes === undefined) return null;
    const item = result.Attributes as OAuthStateItem;
    return {
      state: item.state,
      userId: item.userId,
      provider: item.provider,
      purpose: item.purpose,
      createdAt: item.createdAt,
      ttl: item.ttl,
    };
  }

  public async putCalendarConnection(
    userId: string,
    connection: StoredCalendarConnection,
  ): Promise<void> {
    const item: CalendarConnectionItem = {
      PK: userPk(userId),
      SK: `CONN#${connection.connectionId}`,
      entityType: "CalendarConnection",
      ...connection,
    };
    await this.client.send(
      new PutCommand({ TableName: this.tableName, Item: item }),
    );
  }

  public async findCalendarConnection(
    userId: string,
    provider: "GOOGLE",
    accountIdentifier: string,
  ): Promise<StoredCalendarConnection | null> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
        FilterExpression:
          "#provider = :provider AND accountIdentifier = :account",
        ExpressionAttributeNames: { "#provider": "provider" },
        ExpressionAttributeValues: {
          ":pk": userPk(userId),
          ":prefix": "CONN#",
          ":provider": provider,
          ":account": accountIdentifier,
        },
        ConsistentRead: true,
      }),
    );
    const item = result.Items?.[0] as CalendarConnectionItem | undefined;
    if (item === undefined) return null;
    return {
      connectionId: item.connectionId,
      provider: item.provider,
      accountIdentifier: item.accountIdentifier,
      accessToken: item.accessToken,
      refreshToken: item.refreshToken,
      accessTokenExpiresAt: item.accessTokenExpiresAt,
      status: item.status,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}

function toStoredCreateOperation(
  item: CreateOperationItem,
): StoredCreateOperation {
  return {
    operationId: item.operationId,
    userId: item.userId,
    payloadHash: item.payloadHash,
    status: item.status,
    leaseExpiresAt: item.leaseExpiresAt,
    createdAt: item.createdAt,
  };
}

function toLogicalDestination(
  item: LogicalDestinationItem,
): LogicalDestination {
  return {
    destinationId: item.destinationId,
    name: item.name,
    aliases: item.aliases,
    description: item.description,
    physicalCalendarIds: item.physicalCalendarIds,
    enabled: item.enabled,
  };
}

function isConditionalCheckFailure(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "ConditionalCheckFailedException"
  );
}

function operationPk(operationId: string): string {
  return `OP#${operationId}`;
}

function userPk(userId: string): string {
  return `USER#${userId}`;
}

function destinationSk(destinationId: string): string {
  return `DEST#${destinationId}`;
}

function oauthStatePk(state: string): string {
  return `OAUTHSTATE#${state}`;
}

function assertLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("INVALID_PAGE_LIMIT");
  }
}

function encodeCursor(key: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(key), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): Record<string, string> {
  try {
    const value = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as unknown;
    if (
      typeof value !== "object" ||
      value === null ||
      !("PK" in value) ||
      !("SK" in value) ||
      typeof value.PK !== "string" ||
      typeof value.SK !== "string" ||
      Object.values(value).some((entry) => typeof entry !== "string")
    ) {
      throw new Error("invalid cursor shape");
    }
    return value as Record<string, string>;
  } catch {
    throw new Error("INVALID_CURSOR");
  }
}
