import type { CreateOperationStatus } from "../domain/create-operation.js";
import { DomainValidationError } from "../domain/validation-error.js";

export interface OperationCalendarResult {
  readonly physicalCalendarId: string;
  readonly status: "SUCCESS" | "FAILED";
}

export interface OperationExecutionSnapshot {
  readonly operationId: string;
  readonly payloadHash: string;
  readonly status: CreateOperationStatus;
  readonly leaseExpiresAt: string | null;
  readonly results: readonly OperationCalendarResult[];
}

export interface OperationExecutionRequest {
  readonly operationId: string;
  readonly payloadHash: string;
  readonly physicalCalendarIds: readonly string[];
  readonly now: Date;
  readonly leaseDurationSeconds: number;
  readonly existing: OperationExecutionSnapshot | null;
}

export interface StartOperationDecision {
  readonly kind: "START";
  readonly operationId: string;
  readonly payloadHash: string;
  readonly leaseExpiresAt: string;
  readonly retryPhysicalCalendarIds: readonly string[];
}

export interface ReplayOperationDecision {
  readonly kind: "REPLAY";
  readonly status: "SUCCESS";
  readonly results: readonly OperationCalendarResult[];
}

export interface InProgressOperationDecision {
  readonly kind: "IN_PROGRESS";
  readonly leaseExpiresAt: string;
}

export interface RetryOperationDecision {
  readonly kind: "RESUME" | "RETRY";
  readonly leaseExpiresAt: string;
  readonly retryPhysicalCalendarIds: readonly string[];
}

export type OperationExecutionDecision =
  | StartOperationDecision
  | ReplayOperationDecision
  | InProgressOperationDecision
  | RetryOperationDecision;

export function decideOperationExecution(
  request: OperationExecutionRequest,
): OperationExecutionDecision {
  assertRequestTime(request.now, request.leaseDurationSeconds);
  const physicalCalendarIds = normalizeCalendarIds(request.physicalCalendarIds);

  if (request.existing === null) {
    return Object.freeze({
      kind: "START",
      operationId: request.operationId,
      payloadHash: request.payloadHash,
      leaseExpiresAt: calculateLeaseExpiry(
        request.now,
        request.leaseDurationSeconds,
      ),
      retryPhysicalCalendarIds: Object.freeze(physicalCalendarIds),
    });
  }

  assertSamePayload(request, request.existing);

  if (request.existing.status === "SUCCESS") {
    return Object.freeze({
      kind: "REPLAY",
      status: "SUCCESS",
      results: Object.freeze([...request.existing.results]),
    });
  }

  if (
    request.existing.status === "PROCESSING" &&
    hasActiveLease(request.existing.leaseExpiresAt, request.now)
  ) {
    return Object.freeze({
      kind: "IN_PROGRESS",
      leaseExpiresAt: request.existing.leaseExpiresAt as string,
    });
  }

  const retryPhysicalCalendarIds = selectRetryCalendarIds(
    physicalCalendarIds,
    request.existing.results,
  );
  if (retryPhysicalCalendarIds.length === 0) {
    throw new DomainValidationError(
      "INCONSISTENT_OPERATION_RESULTS",
      "未成功CalendarがないOperationは再試行できません",
    );
  }

  return Object.freeze({
    kind: request.existing.status === "PROCESSING" ? "RESUME" : "RETRY",
    leaseExpiresAt: calculateLeaseExpiry(
      request.now,
      request.leaseDurationSeconds,
    ),
    retryPhysicalCalendarIds: Object.freeze(retryPhysicalCalendarIds),
  });
}

function assertRequestTime(now: Date, leaseDurationSeconds: number): void {
  if (
    !Number.isFinite(now.getTime()) ||
    !Number.isInteger(leaseDurationSeconds) ||
    leaseDurationSeconds < 1
  ) {
    throw new DomainValidationError(
      "INVALID_LEASE_DURATION",
      "有効なnowと1以上の整数のleaseDurationSecondsを指定してください",
    );
  }
}

function assertSamePayload(
  request: OperationExecutionRequest,
  existing: OperationExecutionSnapshot,
): void {
  if (
    existing.operationId !== request.operationId ||
    existing.payloadHash !== request.payloadHash
  ) {
    throw new DomainValidationError(
      "OPERATION_ID_CONFLICT",
      "operationIdは異なるpayloadに再利用できません",
    );
  }
}

function hasActiveLease(leaseExpiresAt: string | null, now: Date): boolean {
  if (leaseExpiresAt === null) {
    return false;
  }
  const expiry = Date.parse(leaseExpiresAt);
  if (!Number.isFinite(expiry)) {
    throw new DomainValidationError(
      "INVALID_OPERATION_LEASE",
      "既存OperationのLease期限が不正です",
    );
  }
  return expiry > now.getTime();
}

function selectRetryCalendarIds(
  requestedIds: readonly string[],
  results: readonly OperationCalendarResult[],
): string[] {
  const requested = new Set(requestedIds);
  const resultIds = results.map(({ physicalCalendarId }) => physicalCalendarId);
  if (
    new Set(resultIds).size !== resultIds.length ||
    resultIds.some((calendarId) => !requested.has(calendarId))
  ) {
    throw new DomainValidationError(
      "INVALID_OPERATION_RESULTS",
      "既存結果は要求対象Calendarと一意に対応する必要があります",
    );
  }

  const succeeded = new Set(
    results
      .filter(({ status }) => status === "SUCCESS")
      .map(({ physicalCalendarId }) => physicalCalendarId),
  );
  return requestedIds.filter((calendarId) => !succeeded.has(calendarId));
}

function calculateLeaseExpiry(now: Date, leaseDurationSeconds: number): string {
  return new Date(now.getTime() + leaseDurationSeconds * 1000).toISOString();
}

function normalizeCalendarIds(calendarIds: readonly string[]): string[] {
  const normalized = calendarIds.map((calendarId) => calendarId.trim()).sort();
  if (
    normalized.length === 0 ||
    normalized.some((calendarId) => calendarId.length === 0) ||
    new Set(normalized).size !== normalized.length
  ) {
    throw new DomainValidationError(
      "INVALID_PHYSICAL_CALENDAR_IDS",
      "Physical Calendar IDは重複なしで1件以上指定してください",
    );
  }
  return normalized;
}
