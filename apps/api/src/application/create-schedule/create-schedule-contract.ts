import type { ScheduleType } from "@schedule-hub/shared";

export type DestinationInferenceType =
  | "EXPLICIT"
  | "ALIAS_MATCH"
  | "SEMANTIC_INFERENCE"
  | "DEFAULT"
  | "CONFIRMED_BY_USER";

export interface CreateScheduleInput {
  readonly operationId: string;
  readonly title: string;
  readonly scheduleType: ScheduleType;
  readonly start: string;
  readonly end: string | null;
  readonly destinationIds: readonly string[];
  readonly location?: string | null;
  readonly description?: string | null;
  readonly assumptions?: readonly string[];
  readonly sourceText?: string | null;
  readonly destinationInference: {
    readonly type: DestinationInferenceType;
    readonly reason: string;
  };
}

export interface CreateScheduleResult {
  readonly operationId: string;
  readonly status: "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";
  readonly replayed: boolean;
  readonly schedule: {
    readonly title: string;
    readonly scheduleType: ScheduleType;
    readonly start: string;
    readonly end: string;
    readonly timezone: string;
  };
  readonly appliedDefaults: readonly ("end")[];
  readonly destinations: readonly CreateScheduleDestinationResult[];
  readonly warnings: readonly CreateScheduleWarning[];
}

export interface CreateScheduleDestinationResult {
  readonly id: string;
  readonly name: string;
  readonly status: "CREATED" | "PARTIAL_SUCCESS" | "FAILED";
  readonly errorCode: string | null;
}

export interface CreateScheduleWarning {
  readonly code: string;
  readonly message: string;
}
