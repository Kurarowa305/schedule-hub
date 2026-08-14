# Separate Schedule Hub authentication from Google Calendar authorization

Status: accepted

Schedule Hub uses Cognito with Google federation for Web and MCP identity, while Calendar access uses a separate direct Google OAuth flow. Web and MCP use separate Cognito App Clients but the same User Pool and Cognito `sub`; Calendar refresh tokens stay inside AWS and are stored in the user's Calendar Connection.

## Consequences

- Logging out does not disconnect Google Calendar.
- Connection loss becomes `REAUTH_REQUIRED`; existing mappings and history remain.
- Refresh tokens are never returned by REST/MCP APIs or written to logs.
