# Schedule Hub API設計

## 1. 目的

本書は、Schedule Hub MVPで利用するAPIインターフェースを定義する。

MCP ToolのJSON Schemaは [MCP Tool詳細設計](./MCP%20Tool詳細設計.md) の「1.1 正式Tool Schema」を正本とする。

対象は以下の3系統とする。

1. Web設定画面から利用するREST API
2. 外部Calendar ProviderとのOAuth連携API
3. Claude公式チャットから利用するRemote MCP API

前提:

- API GatewayはHTTP APIとして構成する。
- 独自ドメインは使用せず、API Gateway標準URLを利用する。
- Web APIとMCP APIは同一API Gateway上に配置する。
- Web APIはAmazon CognitoのJWTで認証する。
- MCP APIもAmazon CognitoをAuthorization Serverとして利用し、MCP resource向けに発行されたAccess Tokenを検証する。
- Google Calendar IDやProvider OAuth TokenはMCP Toolへ公開しない。
- TimeTree / Yahoo!カレンダー向けAPI通信は行わない。

---

## 2. Base URL / Route構成

API Gatewayの `$default` stage を利用する想定とする。

```text
https://{apiId}.execute-api.ap-northeast-1.amazonaws.com
```

Route分類:

```text
/api/v1/*                          Web設定API
/api/v1/oauth/*                    Calendar Provider OAuth callback
/mcp                               Remote MCP endpoint
/.well-known/oauth-protected-resource
/.well-known/oauth-protected-resource/mcp
                                   MCP Protected Resource Metadata
```

---

## 3. 認証方式

### 3.1 Web API

Web SPAはCognito User PoolでAuthorization Code + PKCEによるログインを行う。

API Request:

```http
Authorization: Bearer <Cognito Access Token>
```

API Gateway HTTP APIのJWT AuthorizerでTokenを検証し、Lambdaには認証済みJWT Claimsを渡す。

ユーザー識別子はCognito Access Tokenの `sub` を利用する。

クライアントから `userId` をRequest Parameter / Request Bodyとして受け取らない。

### 3.2 MCP API

ClaudeからのRemote MCP接続もCognito User PoolをAuthorization Serverとして利用する。

MCP Resource URIは以下とする。

```text
https://{apiId}.execute-api.ap-northeast-1.amazonaws.com/mcp
```

Protected Resource Metadata endpointを提供し、Authorization ServerとしてCognitoを通知する。

MVPではMCP側独自のAuthorization Server Lambdaは設けない。

Cognito App ClientはWeb用とClaude/MCP用で分離する。

```text
Cognito User Pool
├ Web App Client
└ MCP App Client
```

MCP用Authorization Code Flowでは `resource` にMCP Resource URIを指定し、Access TokenをMCP Resourceへbindingする。

---

## 4. 共通REST API仕様

### 4.1 Content-Type

```http
Content-Type: application/json
```

OAuth callback等のredirect responseを除き、JSONを使用する。

### 4.2 日時

予定日時等はRFC3339互換のISO-8601文字列を使用する。

例:

```text
2026-08-14T18:00:00+09:00
```

日付のみの場合:

```text
2026-08-14
```

### 4.3 ID

内部IDはProvider上のIDを直接使用せず、Schedule Hub側で生成する。

```text
connectionId        conn_<id>
physicalCalendarId  pcal_<id>
destinationId       dest_<id>
operationId         op_<id>
```

内部IDはprefix付きULIDを使用する。operationIdはClaudeが生成し、同一の作成意図を再試行するときに再利用する。

### 4.4 REST API成功Response

単一Resource:

```json
{
  "data": {}
}
```

一覧:

```json
{
  "data": [],
  "nextCursor": null
}
```

### 4.5 REST API Error Response

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Request is invalid.",
    "details": {}
  }
}
```

代表Error Code:

```text
INVALID_REQUEST
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
CONFLICT
INVALID_DESTINATION
INVALID_PHYSICAL_CALENDAR
PROVIDER_AUTH_EXPIRED
PROVIDER_API_ERROR
INTERNAL_ERROR
```

---

## 5. Web API一覧

| Method | Path | 認証 | 用途 |
|---|---|---|---|
| GET | `/api/v1/me` | 必須 | ユーザー設定取得 |
| PATCH | `/api/v1/me/preferences` | 必須 | ユーザー設定更新 |
| GET | `/api/v1/calendar-connections` | 必須 | Calendar Provider接続一覧 |
| POST | `/api/v1/calendar-connections/{provider}/oauth/start` | 必須 | Provider OAuth開始 |
| GET | `/api/v1/oauth/{provider}/callback` | state検証 | Provider OAuth callback |
| DELETE | `/api/v1/calendar-connections/{connectionId}` | 必須 | Provider接続解除 |
| POST | `/api/v1/calendar-connections/{connectionId}/sync-calendars` | 必須 | Calendar一覧再同期 |
| GET | `/api/v1/physical-calendars` | 必須 | Physical Calendar一覧 |
| PATCH | `/api/v1/physical-calendars/{physicalCalendarId}` | 必須 | Schedule Hub固有Calendar設定更新 |
| GET | `/api/v1/destinations` | 必須 | Logical Destination一覧 |
| POST | `/api/v1/destinations` | 必須 | Logical Destination作成 |
| PATCH | `/api/v1/destinations/{destinationId}` | 必須 | Logical Destination更新 / 無効化 |
| GET | `/api/v1/external-display-targets` | 必須 | TimeTree/Yahoo表示設定取得 |
| PUT | `/api/v1/external-display-targets/{target}` | 必須 | 外部表示設定保存 |
| GET | `/api/v1/operations` | 必須 | 予定登録履歴一覧 |
| GET | `/api/v1/operations/{operationId}` | 必須 | 予定登録結果詳細 |

---

## 6. User API

### 6.1 GET `/api/v1/me`

ユーザー基本設定を取得する。

Response:

```json
{
  "data": {
    "userId": "<cognito-sub>",
    "timezone": "Asia/Tokyo",
    "defaultDurationMinutes": 120,
    "defaultDestinationIds": ["dest_xxx"]
  }
}
```

初回アクセスでPROFILEが存在しない場合は、Lambda側でデフォルトProfileを生成してもよい。

### 6.2 PATCH `/api/v1/me/preferences`

Request:

```json
{
  "timezone": "Asia/Tokyo",
  "defaultDurationMinutes": 120,
  "defaultDestinationIds": ["dest_xxx"]
}
```

全項目任意とし、指定項目のみ更新する。

Validation:

- `timezone` はIANA Time Zone
- `defaultDurationMinutes` は1以上
- `defaultDestinationIds` は認証ユーザーが所有し、有効なDestinationのみ

---

## 7. CalendarConnection API

### 7.1 GET `/api/v1/calendar-connections`

Response:

```json
{
  "data": [
    {
      "connectionId": "conn_xxx",
      "provider": "GOOGLE",
      "accountIdentifier": "example@gmail.com",
      "status": "ACTIVE",
      "createdAt": "2026-08-13T14:00:00+09:00"
    }
  ]
}
```

Access Token / Refresh Tokenは返さない。

### 7.2 POST `/api/v1/calendar-connections/{provider}/oauth/start`

MVP provider:

```text
GOOGLE
```

Response:

```json
{
  "data": {
    "authorizationUrl": "https://..."
  }
}
```

処理:

1. OAuthState生成
2. DynamoDBへTTL付き保存
3. Provider Authorization URL生成
4. URLを返す

### 7.3 GET `/api/v1/oauth/{provider}/callback`

Query:

```text
code
state
```

処理:

1. OAuthState取得
2. state / provider / ttl検証
3. codeをProvider Tokenへ交換
4. CalendarConnection保存
5. PhysicalCalendar同期
6. OAuthState削除
7. Web SPAへ302 redirect

成功例:

```text
https://<cloudfront-domain>/settings/calendars?oauth=success
```

失敗例:

```text
https://<cloudfront-domain>/settings/calendars?oauth=failed
```

### 7.4 DELETE `/api/v1/calendar-connections/{connectionId}`

CalendarConnectionを無効化または削除する。

紐づくPhysicalCalendarは `writable=false` / `status=DISCONNECTED` 等へ変更する。

既存CreateOperation / ExternalEventは削除しない。

### 7.5 POST `/api/v1/calendar-connections/{connectionId}/sync-calendars`

ProviderからCalendar一覧を再取得してPhysicalCalendarを同期する。

Response:

```json
{
  "data": {
    "connectionId": "conn_xxx",
    "syncedCount": 5
  }
}
```

---

## 8. PhysicalCalendar API

### 8.1 GET `/api/v1/physical-calendars`

Query Parameter:

```text
connectionId optional
writableOnly optional
```

Response:

```json
{
  "data": [
    {
      "physicalCalendarId": "pcal_xxx",
      "provider": "GOOGLE",
      "connectionId": "conn_xxx",
      "name": "仕事",
      "accessRole": "owner",
      "writable": true,
      "eventColorId": null
    }
  ]
}
```

`externalCalendarId` はWeb UIで不要なため原則返さない。

### 8.2 PATCH `/api/v1/physical-calendars/{physicalCalendarId}`

Schedule Hub側の設定のみ変更する。

Request例:

```json
{
  "eventColorId": "5"
}
```

Provider上のCalendar名称等を変更するAPIではない。

---

## 9. LogicalDestination API

### 9.1 GET `/api/v1/destinations`

Response:

```json
{
  "data": [
    {
      "destinationId": "dest_xxx",
      "name": "仕事",
      "aliases": ["会社", "業務", "work"],
      "description": "会議、出社、顧客対応など仕事に関する予定",
      "physicalCalendarIds": ["pcal_work"],
      "enabled": true
    }
  ]
}
```

### 9.2 POST `/api/v1/destinations`

`destinationId` はサーバーで生成する。

Request:

```json
{
  "name": "仕事",
  "aliases": ["会社", "業務", "work"],
  "description": "会議、出社、顧客対応など仕事に関する予定",
  "physicalCalendarIds": ["pcal_work"]
}
```

Validation:

- `name` 必須
- `physicalCalendarIds` は1件以上
- 全PhysicalCalendarが認証ユーザー所有
- 全PhysicalCalendarが書込可能

Response:

```json
{
  "data": {
    "destinationId": "dest_xxx"
  }
}
```

### 9.3 PATCH `/api/v1/destinations/{destinationId}`

Request例:

```json
{
  "name": "仕事",
  "aliases": ["会社", "業務"],
  "description": "仕事関連の予定",
  "physicalCalendarIds": ["pcal_work"],
  "enabled": true
}
```

MVPでは物理DELETE APIを用意せず、`enabled=false` で無効化する。

---

## 10. ExternalDisplayTarget API

### 10.1 GET `/api/v1/external-display-targets`

Response:

```json
{
  "data": [
    {
      "target": "TIMETREE",
      "enabled": true,
      "physicalCalendarId": "pcal_private",
      "setupConfirmed": true
    },
    {
      "target": "YAHOO",
      "enabled": false,
      "physicalCalendarId": null,
      "setupConfirmed": false
    }
  ]
}
```

### 10.2 PUT `/api/v1/external-display-targets/{target}`

MVP target:

```text
TIMETREE
YAHOO
```

Request:

```json
{
  "enabled": true,
  "physicalCalendarId": "pcal_private",
  "setupConfirmed": true
}
```

Schedule Hubから対象サービスへAPI通信は行わない。

---

## 11. Operation API

### 11.1 GET `/api/v1/operations`

Query:

```text
limit  optional default=20 max=100
cursor optional
```

Response:

```json
{
  "data": [
    {
      "operationId": "op_xxx",
      "title": "顧客との定例",
      "start": "2026-08-14T10:00:00+09:00",
      "end": "2026-08-14T11:00:00+09:00",
      "destinationIds": ["dest_work"],
      "status": "SUCCESS",
      "createdAt": "2026-08-13T14:10:00+09:00"
    }
  ],
  "nextCursor": null
}
```

DynamoDB `LastEvaluatedKey` は直接公開せず、Base64URL等でopaque cursor化する。

### 11.2 GET `/api/v1/operations/{operationId}`

認証ユーザー自身のOperationのみ取得可能とする。

Response:

```json
{
  "data": {
    "operationId": "op_xxx",
    "title": "顧客との定例",
    "start": "2026-08-14T10:00:00+09:00",
    "end": "2026-08-14T11:00:00+09:00",
    "timezone": "Asia/Tokyo",
    "destinationIds": ["dest_work"],
    "status": "PARTIAL_SUCCESS",
    "events": [
      {
        "physicalCalendarId": "pcal_work",
        "status": "SUCCESS"
      },
      {
        "physicalCalendarId": "pcal_shared",
        "status": "FAILED",
        "errorCode": "PROVIDER_API_ERROR"
      }
    ]
  }
}
```

---

## 12. MCP Transport API

### 12.1 Endpoint

```text
POST /mcp
GET  /mcp
```

Streamable HTTP / JSON-RPC 2.0を使用する。

MVPではServer-Sent Events、server-to-client notification、stateful MCP sessionは使用しない。

したがって:

```text
POST /mcp → application/json
GET  /mcp → 405 Method Not Allowed
```

とする。

Session IDは発行しない。

### 12.2 MCP Capability

MVP Server Capability:

```json
{
  "capabilities": {
    "tools": {}
  }
}
```

prompts / resources / sampling / tasks等は提供しない。

### 12.3 MCP Tools

```text
get_schedule_context
create_schedule
```

---

## 13. MCP Tool Schema

get_schedule_contextとcreate_scheduleの正式なTool Schema、入力検証、出力、Tool Errorは [MCP Tool詳細設計](./MCP%20Tool詳細設計.md) の「1.1 正式Tool Schema」に定義する。

MCP APIはそのSchemaを実装上の唯一の契約とし、Physical Calendar ID、Provider Calendar ID、Connection ID、Googleアカウント識別子、Access Token、Refresh TokenをClaudeへ公開しない。

create_scheduleは、Claude生成のoperationIdを冪等キーとして扱う。destinationIdsは1件以上必須で、TimezoneはTool Inputから受け取らずUserPreferenceを使用する。

---

## 16. create_schedule内部API処理順

```text
1. JWTからuserId取得
2. Tool Input Validation
3. operationId Conditional Put
4. PROFILE取得
5. destinationIds検証（1件以上必須）
6. LogicalDestination取得・検証
7. physicalCalendarIdsを集約
8. PhysicalCalendar ID重複排除
9. PhysicalCalendar / CalendarConnection取得
10. Provider Adapter選択
11. Provider Token refresh
12. Calendar Event create
13. ExternalEvent保存
14. CreateOperation status更新
15. MCP structured result返却
```

Provider Adapter:

```text
provider = GOOGLE
    ↓
GoogleCalendarAdapter

将来:
provider = MICROSOFT_OUTLOOK
    ↓
OutlookCalendarAdapter
```

---

## 17. Google Calendar APIとの対応

MVPでは以下を利用する。

```text
Calendar一覧取得
CalendarList.list

予定作成
Events.insert
```

Calendar同期時はGoogle Calendarの `accessRole` を取得し、writer / owner相当のみSchedule Hubの書込先として利用可能にする。

Google API固有のCalendar IDは `PhysicalCalendar.externalCalendarId` に保持し、Web API / MCP APIには原則公開しない。

---

## 18. APIとLambdaの対応

### MCP Lambda

```text
POST /mcp
GET  /mcp

initialize
tools/list
tools/call
get_schedule_context
create_schedule
```

### WebApi Lambda

```text
GET/PATCH /api/v1/me*
GET       /api/v1/calendar-connections
DELETE    /api/v1/calendar-connections/{id}
POST      /api/v1/calendar-connections/{id}/sync-calendars
GET/PATCH /api/v1/physical-calendars*
GET/POST/PATCH /api/v1/destinations*
GET/PUT   /api/v1/external-display-targets*
GET       /api/v1/operations*
```

### CalendarOAuth Lambda

```text
POST /api/v1/calendar-connections/{provider}/oauth/start
GET  /api/v1/oauth/{provider}/callback
```

---

## 19. MVPで提供しないAPI

```text
予定検索API
予定変更API
予定削除API
Free/Busy API
TimeTree直接API
Yahoo直接API
PhysicalCalendar作成API
Provider上Calendarの編集API
```

将来MCP Toolとして以下を追加する想定:

```text
search_schedule
update_schedule
delete_schedule
find_free_time
```

---

## 20. 設計上の重要ポイント

1. Web REST APIとMCP APIを明確に分離する。
2. MCPは単一 `/mcp` endpointを利用し、Tool名をHTTP Routeにしない。
3. ClaudeへPhysical Calendar IDやProvider Tokenを公開しない。
4. `destinationId` はSchedule Hubが生成する不変内部IDとし、Destination名称変更の影響を受けない。
5. `create_schedule` の `operationId` を冪等キーとして利用する。
6. destinationIdsã¯1ä»¶ä»¥ä¸å¿é ã¨ããç»é²åæªæå®æã¯Claudeãget_schedule_contextã®defaultDestinationIdsãæç¤ºçã«æ¸¡ãã
7. Provider固有差異はCalendar Adapterへ閉じ込め、Web/MCP API SchemaをProvider非依存に保つ。
8. MCP Tool ResultはstructuredContent中心とし、LLMが再判断できるactionableなErrorを返す。
