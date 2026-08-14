# Schedule Hub Domain

Schedule Hub connects Claude's natural-language schedule creation to a user's configured Google Calendars through logical registration destinations.

## Language

**User**:
The Schedule Hub account identified by the Cognito `sub` claim.
_Avoid_: Google account, Calendar account

**Logical Destination**:
A user-facing registration intent such as work or private. Claude selects it; Schedule Hub resolves it to one or more Physical Calendars.
_Avoid_: Physical Calendar, mapping target

**Physical Calendar**:
A provider calendar that Schedule Hub can write to, represented internally by a stable Schedule Hub ID and a provider calendar ID.
_Avoid_: Logical Destination, Bridge Calendar

**Calendar Connection**:
An authenticated connection between a User and a calendar provider. Google Calendar authorization is separate from Schedule Hub sign-in.
_Avoid_: Login session

**Create Operation**:
One user intent to create a schedule, identified by an `operationId` and tracked across all target Physical Calendars.
_Avoid_: request, event

**External Event**:
The result of creating one Create Operation on one Physical Calendar.
_Avoid_: schedule operation

**Bridge Calendar**:
A Google Calendar selected so an external calendar app can display its events. Schedule Hub does not write directly to that external app.
_Avoid_: external integration calendar
