export type CreateScheduleErrorCode =
  | "INVALID_DATETIME"
  | "INVALID_DESTINATION"
  | "DESTINATION_DISABLED"
  | "NO_WRITABLE_CALENDAR"
  | "PROVIDER_AUTH_EXPIRED"
  | "PROVIDER_API_ERROR"
  | "OPERATION_ID_CONFLICT"
  | "OPERATION_IN_PROGRESS";

export class CreateScheduleError extends Error {
  public constructor(
    public readonly code: CreateScheduleErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CreateScheduleError";
  }
}
