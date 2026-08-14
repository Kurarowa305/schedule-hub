# Keep Logical Destinations at the MCP boundary

Status: accepted

Claude and the MCP tools expose only Logical Destination IDs. Schedule Hub resolves those IDs to Physical Calendars internally, so provider calendar IDs, account identifiers, and OAuth credentials never cross the MCP boundary. This preserves the user-facing model and lets provider adapters evolve without changing the tool contract.

## Consequences

- `create_schedule` validates destination ownership and enabled state on the server.
- Multiple Logical Destinations resolving to the same Physical Calendar are deduplicated before provider calls.
- The DynamoDB MVP model stores `physicalCalendarIds` on `LogicalDestination`; an independent Mapping entity is not introduced.
