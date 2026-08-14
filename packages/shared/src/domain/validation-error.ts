export class DomainValidationError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DomainValidationError";
  }
}
