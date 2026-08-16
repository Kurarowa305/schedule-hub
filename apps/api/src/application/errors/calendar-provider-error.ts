export type CalendarProviderErrorCode =
  | "AUTH_EXPIRED"
  | "RETRY_EXHAUSTED"
  | "REQUEST_FAILED";

export class CalendarProviderError extends Error {
  public constructor(
    public readonly code: CalendarProviderErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CalendarProviderError";
  }
}
