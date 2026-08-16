import type { LogicalDestination, UserPreference } from "@schedule-hub/shared";
import type {
  Page,
  ScheduleHubRepository,
  StoredCreateOperation,
  StoredOAuthState,
} from "../../application/ports/schedule-hub-repository.js";

export class FakeScheduleHubRepository implements ScheduleHubRepository {
  readonly #operations = new Map<string, StoredCreateOperation>();
  readonly #destinations = new Map<string, Map<string, LogicalDestination>>();
  readonly #preferences = new Map<string, UserPreference>();
  readonly #oauthStates = new Map<string, StoredOAuthState>();

  public async putCreateOperationIfAbsent(
    operation: StoredCreateOperation,
  ): Promise<boolean> {
    if (this.#operations.has(operation.operationId)) {
      return false;
    }
    this.#operations.set(operation.operationId, structuredClone(operation));
    return true;
  }

  public async getCreateOperation(
    operationId: string,
  ): Promise<StoredCreateOperation | null> {
    const operation = this.#operations.get(operationId);
    return operation === undefined ? null : structuredClone(operation);
  }

  public async putUserPreference(
    userId: string,
    preference: UserPreference,
  ): Promise<void> {
    this.#preferences.set(userId, structuredClone(preference));
  }

  public async getUserPreference(
    userId: string,
  ): Promise<UserPreference | null> {
    const preference = this.#preferences.get(userId);
    return preference === undefined ? null : structuredClone(preference);
  }

  public async putOAuthState(state: StoredOAuthState): Promise<void> {
    this.#oauthStates.set(state.state, structuredClone(state));
  }

  public async getOAuthState(state: string): Promise<StoredOAuthState | null> {
    const oauthState = this.#oauthStates.get(state);
    return oauthState === undefined ? null : structuredClone(oauthState);
  }

  public async putLogicalDestination(
    userId: string,
    destination: LogicalDestination,
  ): Promise<void> {
    const collection = this.#destinations.get(userId) ?? new Map();
    collection.set(destination.destinationId, structuredClone(destination));
    this.#destinations.set(userId, collection);
  }

  public async listLogicalDestinations(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<Page<LogicalDestination>> {
    assertLimit(limit);
    const collection = this.#destinations.get(userId) ?? new Map();
    const items = [...collection.values()].sort((left, right) =>
      left.destinationId.localeCompare(right.destinationId),
    );
    const startAfter = cursor === undefined ? null : decodeCursor(cursor);
    const startIndex =
      startAfter === null
        ? 0
        : items.findIndex(({ destinationId }) => destinationId === startAfter) +
          1;
    if (startAfter !== null && startIndex === 0) {
      throw new Error("INVALID_CURSOR");
    }

    const pageItems = items.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + pageItems.length < items.length;

    return {
      items: structuredClone(pageItems),
      nextCursor: hasMore
        ? encodeCursor(pageItems.at(-1)?.destinationId ?? "")
        : null,
    };
  }
  public async listRecentCreateOperations(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<Page<StoredCreateOperation>> {
    assertLimit(limit);
    const items = [...this.#operations.values()]
      .filter((operation) => operation.userId === userId)
      .sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt) ||
        right.operationId.localeCompare(left.operationId),
      );
    const startAfter = cursor === undefined ? null : decodeCursor(cursor);
    const startIndex =
      startAfter === null
        ? 0
        : items.findIndex(({ operationId }) => operationId === startAfter) + 1;
    if (startAfter !== null && startIndex === 0) {
      throw new Error("INVALID_CURSOR");
    }

    const pageItems = items.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + pageItems.length < items.length;
    return {
      items: structuredClone(pageItems),
      nextCursor: hasMore
        ? encodeCursor(pageItems.at(-1)?.operationId ?? "")
        : null,
    };
  }
}

function assertLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("INVALID_PAGE_LIMIT");
  }
}

function encodeCursor(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): string {
  try {
    const value = Buffer.from(cursor, "base64url").toString("utf8");
    if (value.length === 0) {
      throw new Error("empty cursor");
    }
    return value;
  } catch {
    throw new Error("INVALID_CURSOR");
  }
}
