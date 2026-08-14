# Schedule Hub 正式Schema（MVP）

この文書を `get_schedule_context` / `create_schedule` のSchemaの正本とする。`docs/API設計.md` と `docs/MCP Tool詳細設計.md` は本書を参照し、表記が異なる場合は本書を優先する。

## 共通規約

- JSON Schema Draft 2020-12
- IDはSchedule Hubが生成するprefix付きULID。ただし `operationId` はClaudeが1つの作成意図につき1つ生成し、再試行時に再利用する。
- 成功・状態enumは大文字で統一する。
- 日時はRFC3339、終日予定は`YYYY-MM-DD`。
- `timezone`はTool Inputに含めず、認証ユーザーのUserPreferenceを使用する。
- `currentDateTime`はUserPreferenceのIANA Time Zoneへ変換して返す。
- `destinationIds`は1件以上必須。デフォルトDestinationはClaudeがContextから選び、明示的に渡す。

## get_schedule_context

```json
{
  "name": "get_schedule_context",
  "inputSchema": {
    "type": "object",
    "additionalProperties": false
  },
  "outputSchema": {
    "type": "object",
    "additionalProperties": false,
    "required": ["currentDateTime", "timezone", "defaultDurationMinutes", "defaultDestinationIds", "destinations"],
    "properties": {
      "currentDateTime": { "type": "string", "format": "date-time" },
      "timezone": { "type": "string" },
      "defaultDurationMinutes": { "type": "integer", "minimum": 1, "maximum": 1440 },
      "defaultDestinationIds": { "type": "array", "items": { "type": "string" } },
      "destinations": {
        "type": "array",
        "maxItems": 50,
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": ["id", "name", "aliases", "description"],
          "properties": {
            "id": { "type": "string" },
            "name": { "type": "string" },
            "aliases": { "type": "array", "maxItems": 20, "items": { "type": "string", "maxLength": 50 } },
            "description": { "type": "string", "maxLength": 500 }
          }
        }
      }
    }
  }
}
```

`Physical Calendar ID`、provider calendar ID、Connection ID、Google account identifier、access token、refresh tokenは返さない。無効なDestinationはContextに含めない。

## create_schedule

```json
{
  "name": "create_schedule",
  "inputSchema": {
    "type": "object",
    "additionalProperties": false,
    "required": ["operationId", "title", "scheduleType", "start", "destinationIds", "destinationInference"],
    "properties": {
      "operationId": { "type": "string", "pattern": "^op_[0-9A-HJKMNP-TV-Z]{26}$" },
      "title": { "type": "string", "minLength": 1, "maxLength": 200 },
      "scheduleType": { "type": "string", "enum": ["TIMED", "ALL_DAY"] },
      "start": { "type": "string" },
      "end": { "type": ["string", "null"] },
      "destinationIds": { "type": "array", "minItems": 1, "maxItems": 50, "uniqueItems": true, "items": { "type": "string" } },
      "location": { "type": ["string", "null"], "maxLength": 500 },
      "description": { "type": ["string", "null"], "maxLength": 5000 },
      "assumptions": { "type": "array", "maxItems": 20, "items": { "type": "string", "maxLength": 500 } },
      "destinationInference": {
        "type": "object",
        "additionalProperties": false,
        "required": ["type", "reason"],
        "properties": {
          "type": { "type": "string", "enum": ["EXPLICIT", "ALIAS_MATCH", "SEMANTIC_INFERENCE", "DEFAULT", "CONFIRMED_BY_USER"] },
          "reason": { "type": "string", "maxLength": 500 }
        }
      },
      "sourceText": { "type": ["string", "null"], "maxLength": 2000 }
    }
  }
}
```

Validation rules:

- `TIMED`: `start` is RFC3339, `end` is optional, and missing `end` uses UserPreference `defaultDurationMinutes`.
- `ALL_DAY`: `start` and `end` are dates; `end` is user-facing inclusive and is converted to the provider's exclusive end date.
- Destination IDs must belong to the authenticated user and be enabled.
- A single operation may resolve to at most 20 unique Physical Calendars.
- `timezone` is never accepted from the Tool; the server uses UserPreference.

## create_schedule output

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["operationId", "status", "replayed", "schedule", "destinations"],
  "properties": {
    "operationId": { "type": "string" },
    "status": { "type": "string", "enum": ["SUCCESS", "PARTIAL_SUCCESS", "FAILED"] },
    "replayed": { "type": "boolean" },
    "schedule": {
      "type": "object",
      "required": ["title", "scheduleType", "start", "end", "timezone"],
      "properties": {
        "title": { "type": "string" },
        "scheduleType": { "type": "string", "enum": ["TIMED", "ALL_DAY"] },
        "start": { "type": "string" },
        "end": { "type": "string" },
        "timezone": { "type": "string" }
      }
    },
    "destinations": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "name", "status", "errorCode"],
        "properties": {
          "id": { "type": "string" },
          "name": { "type": "string" },
          "status": { "type": "string", "enum": ["CREATED", "PARTIAL_SUCCESS", "FAILED"] },
          "errorCode": { "type": ["string", "null"] }
        }
      }
    }
  }
}
```

## Tool Error

JSON-RPC protocol errorsはJSON-RPC Error、業務エラーは`isError=true`のTool Resultで返す。代表コードは`INVALID_DATETIME`、`INVALID_DESTINATION`、`DESTINATION_DISABLED`、`NO_WRITABLE_CALENDAR`、`PROVIDER_AUTH_EXPIRED`、`PROVIDER_API_ERROR`、`OPERATION_ID_CONFLICT`。
