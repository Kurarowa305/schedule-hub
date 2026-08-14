# Make schedule creation idempotent by operation

Status: accepted

Each Claude create intent supplies a Claude-generated ULID `operationId`. Schedule Hub stores a conditional `CreateOperation`, uses `hash(userId + operationId + physicalCalendarId)` as the deterministic provider event identifier, and records per-calendar `ExternalEvent` results. Retries reuse the same operation and only retry calendars without a successful result.

## Consequences

- A repeated operation with the same payload returns the existing result.
- Reusing an `operationId` with a different payload returns `OPERATION_ID_CONFLICT`.
- A stuck `PROCESSING` operation is recovered with a DynamoDB lease/conditional update.
- Partial success is represented per Physical Calendar and aggregated per Logical Destination.
