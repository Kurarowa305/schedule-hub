import type {
  LogicalDestination,
  PhysicalCalendar,
  UserPreference,
} from "@schedule-hub/shared";
import type {
  CalendarConnectionCredentials,
  CalendarCredentialUpdate,
} from "./calendar-provider.js";
import type { CreateScheduleResult } from "../create-schedule/create-schedule-contract.js";

export interface CalendarConnection {
  readonly connectionId: string;
  readonly provider: "GOOGLE";
  readonly status: "ACTIVE" | "REAUTH_REQUIRED";
  readonly credentials: CalendarConnectionCredentials;
}

export interface BeginCreateScheduleCommand {
  readonly operationId: string;
  readonly userId: string;
  readonly payloadHash: string;
  readonly physicalCalendarIds: readonly string[];
  readonly leaseExpiresAt: string;
  readonly createdAt: string;
}

export type BeginCreateScheduleResult =
  | {
      readonly kind: "EXECUTE";
      readonly physicalCalendarIds: readonly string[];
      readonly existingResults: readonly StoredCalendarExecutionResult[];
    }
  | { readonly kind: "REPLAY"; readonly result: CreateScheduleResult }
  | { readonly kind: "IN_PROGRESS" }
  | { readonly kind: "CONFLICT" };

export interface StoredCalendarExecutionResult {
  readonly operationId: string;
  readonly physicalCalendarId: string;
  readonly provider: "GOOGLE";
  readonly status: "SUCCESS" | "FAILED";
  readonly externalEventId: string | null;
  readonly errorCode: string | null;
}

export interface CreateScheduleStore {
  getUserPreference(userId: string): Promise<UserPreference | null>;
  getLogicalDestinations(
    userId: string,
    destinationIds: readonly string[],
  ): Promise<readonly LogicalDestination[]>;
  getPhysicalCalendars(
    userId: string,
    physicalCalendarIds: readonly string[],
  ): Promise<readonly PhysicalCalendar[]>;
  getCalendarConnections(
    userId: string,
    connectionIds: readonly string[],
  ): Promise<readonly CalendarConnection[]>;
  beginCreateSchedule(
    command: BeginCreateScheduleCommand,
  ): Promise<BeginCreateScheduleResult>;
  saveCalendarExecutionResult(
    result: StoredCalendarExecutionResult,
  ): Promise<void>;
  updateCalendarConnectionCredentials(
    userId: string,
    connectionId: string,
    update: CalendarCredentialUpdate,
  ): Promise<void>;
  markCalendarConnectionReauthRequired(
    userId: string,
    connectionId: string,
  ): Promise<void>;
  completeCreateSchedule(result: CreateScheduleResult): Promise<void>;
}
