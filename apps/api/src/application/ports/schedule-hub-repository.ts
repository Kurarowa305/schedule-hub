import type {
  CreateOperationStatus,
  LogicalDestination,
  UserPreference,
} from "@schedule-hub/shared";

export interface StoredCreateOperation {
  readonly operationId: string;
  readonly userId: string;
  readonly payloadHash: string;
  readonly status: CreateOperationStatus;
  readonly leaseExpiresAt: string | null;
  readonly createdAt: string;
}

export interface StoredOAuthState {
  readonly state: string;
  readonly userId: string;
  readonly provider: "GOOGLE";
  readonly purpose: "CALENDAR_CONNECT";
  readonly createdAt: number;
  readonly ttl: number;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export interface ScheduleHubRepository {
  putCreateOperationIfAbsent(
    operation: StoredCreateOperation,
  ): Promise<boolean>;
  getCreateOperation(
    operationId: string,
  ): Promise<StoredCreateOperation | null>;
  putUserPreference(userId: string, preference: UserPreference): Promise<void>;
  getUserPreference(userId: string): Promise<UserPreference | null>;
  putLogicalDestination(
    userId: string,
    destination: LogicalDestination,
  ): Promise<void>;
  listLogicalDestinations(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<Page<LogicalDestination>>;
  listRecentCreateOperations(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<Page<StoredCreateOperation>>;
  putOAuthState(state: StoredOAuthState): Promise<void>;
  getOAuthState(state: string): Promise<StoredOAuthState | null>;
}
