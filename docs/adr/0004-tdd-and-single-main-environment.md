# Use vertical-slice TDD in one AWS environment

Status: accepted

Implementation proceeds red → green → refactor at agreed public seams: domain/application ports, API handlers, MCP tool contracts, and selected AWS integration seams. CDK manages one `main` environment; CI mocks Google APIs, while a dedicated Google test account and test Calendar are used for manual pre-release verification.

## Consequences

- Tests verify behavior through public interfaces rather than private collaborators.
- Test users follow the same domain, DynamoDB, OAuth, and retention rules as normal users.
- OAuthState is TTL-managed; CreateOperation and ExternalEvent history is retained.
