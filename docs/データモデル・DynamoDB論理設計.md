# Schedule Hub データモデル・DynamoDB論理設計

## 1. 目的

本書は、Schedule Hub MVPで利用するデータモデルとDynamoDBの論理設計を定義する。

前提:

- DynamoDBは1テーブル構成とする。
- Billing ModeはPAY_PER_REQUESTを想定する。
- 主キーは `PK` / `SK` とする。
- ユーザー設定、カレンダー接続情報、予定作成Operation、OAuth一時データを同一テーブルに保持する。
- ユーザー別の予定作成履歴取得用にGSIを1本持つ。

---

## 2. テーブル定義

### 2.1 テーブル

```text
Table: ScheduleHub

PK      String
SK      String
GSI1PK  String (optional)
GSI1SK  String (optional)
ttl     Number (optional)
```

### 2.2 GSI

```text
GSI1
Partition Key: GSI1PK
Sort Key:      GSI1SK
```

主用途は、ユーザー単位で最近の予定登録Operationを取得することである。

---

## 3. Item Collection構成

```text
USER#<userId>
    ├ PROFILE
    ├ CONN#<connectionId>
    ├ PCAL#<physicalCalendarId>
    ├ DEST#<destinationId>
    └ DISPLAY#<target>

OP#<operationId>
    ├ META
    └ EVENT#<physicalCalendarId>

OAUTHSTATE#<state>
    └ META
```

---

## 4. Entity一覧

| Entity | PK | SK | 概要 |
|---|---|---|---|
| User/Profile | `USER#<userId>` | `PROFILE` | ユーザー基本設定 |
| CalendarConnection | `USER#<userId>` | `CONN#<connectionId>` | Google等の外部Calendar Providerとの接続情報 |
| PhysicalCalendar | `USER#<userId>` | `PCAL#<physicalCalendarId>` | 実際にAPIで操作する外部カレンダー |
| LogicalDestination | `USER#<userId>` | `DEST#<destinationId>` | Claudeが扱う意味上の登録先 |
| ExternalDisplayTarget | `USER#<userId>` | `DISPLAY#<target>` | TimeTree / Yahoo等の外部表示設定 |
| CreateOperation | `OP#<operationId>` | `META` | 予定作成操作 |
| ExternalEvent | `OP#<operationId>` | `EVENT#<physicalCalendarId>` | Physical Calendarごとの登録結果 |
| OAuthState | `OAUTHSTATE#<state>` | `META` | OAuthリダイレクト中の一時状態 |

---

## 5. User / UserPreference

UserとUserPreferenceは、MVPでは常に一緒に取得するため1Itemに統合する。

```text
PK = USER#<userId>
SK = PROFILE
```

例:

```json
{
  "PK": "USER#abc123",
  "SK": "PROFILE",
  "entityType": "User",
  "timezone": "Asia/Tokyo",
  "defaultDurationMinutes": 120,
  "defaultDestinationIds": ["private"],
  "createdAt": "2026-08-13T13:00:00+09:00",
  "updatedAt": "2026-08-13T13:30:00+09:00"
}
```

---

## 6. CalendarConnection

### 6.1 役割

外部Calendar Providerとの認証・接続単位を表す。

MVPではGoogleのみ利用するが、データモデル上は特定Providerに依存しない `CalendarConnection` として扱う。

```text
PK = USER#<userId>
SK = CONN#<connectionId>
```

Google接続例:

```json
{
  "PK": "USER#abc123",
  "SK": "CONN#conn_google_01",
  "entityType": "CalendarConnection",
  "connectionId": "conn_google_01",
  "provider": "GOOGLE",
  "accountIdentifier": "example@gmail.com",
  "accessToken": "...",
  "refreshToken": "...",
  "accessTokenExpiresAt": 1786596000,
  "status": "ACTIVE",
  "createdAt": "...",
  "updatedAt": "..."
}
```

### 6.2 将来のProvider追加

将来、Google以外のカレンダーと公式API連携する場合も、基本的にはProviderごとの接続情報を `CalendarConnection` として追加する。

例:

```text
CONN#conn_google_01
provider = GOOGLE

CONN#conn_outlook_01
provider = MICROSOFT_OUTLOOK

CONN#conn_other_01
provider = OTHER_PROVIDER
```

実装コード上はProviderごとに、例えば以下のようなAdapter / Credential実装を追加する。

```text
GoogleCalendarAdapter
OutlookCalendarAdapter
OtherCalendarAdapter
```

必要であればProvider固有属性を `providerData` 等に保持する。

### 6.3 `???Connection` Entityを増やすか

概念上は `GoogleConnection`、`OutlookConnection` 等とProvider別に考えてもよいが、DynamoDB上ではEntityをProviderごとに増やさず、共通の `CalendarConnection` Entityへ統一することを推奨する。

これによりPhysicalCalendar側に、

```text
googleConnectionId
outlookConnectionId
...
```

とProviderごとの属性を追加する必要がない。

---

## 7. PhysicalCalendar

外部Provider上で実際に予定を作成するカレンダーを表す。

```text
PK = USER#<userId>
SK = PCAL#<physicalCalendarId>
```

例:

```json
{
  "PK": "USER#abc123",
  "SK": "PCAL#pc_work",
  "entityType": "PhysicalCalendar",
  "physicalCalendarId": "pc_work",
  "provider": "GOOGLE",
  "connectionId": "conn_google_01",
  "externalCalendarId": "xxxxx@group.calendar.google.com",
  "name": "仕事",
  "accessRole": "owner",
  "writable": true,
  "eventColorId": null,
  "createdAt": "...",
  "updatedAt": "..."
}
```

### 7.1 Provider拡張方針

`PhysicalCalendar` はProvider共通Entityとし、以下を持つ。

```text
provider
connectionId
externalCalendarId
```

例えばMicrosoft Outlook連携を追加した場合:

```json
{
  "physicalCalendarId": "pc_outlook_work",
  "provider": "MICROSOFT_OUTLOOK",
  "connectionId": "conn_outlook_01",
  "externalCalendarId": "<Outlook側Calendar ID>"
}
```

この形にすることで、Provider追加時にPhysicalCalendarのSchemaへ `outlookConnectionId` 等を追加せずに拡張できる。

処理時は、

```text
PhysicalCalendar.provider
        ↓
対応Calendar Adapter選択
        ↓
PhysicalCalendar.connectionId
        ↓
CalendarConnection取得
        ↓
Provider API
```

とする。

---

## 8. LogicalDestination

Claudeが自然言語から判断する意味上の登録先を表す。

```text
PK = USER#<userId>
SK = DEST#<destinationId>
```

例:

```json
{
  "PK": "USER#abc123",
  "SK": "DEST#work",
  "entityType": "LogicalDestination",
  "destinationId": "work",
  "name": "仕事",
  "aliases": ["会社", "業務", "work"],
  "description": "会議、出社、顧客対応など仕事に関する予定",
  "physicalCalendarIds": ["pc_work"],
  "enabled": true,
  "createdAt": "...",
  "updatedAt": "..."
}
```

MVPではDestinationMappingを独立Itemにせず、`physicalCalendarIds` をLogicalDestinationへ保持する。
既存資料中のDestinationMappingは、LogicalDestination.physicalCalendarIdsが表す概念上の関係を指し、DynamoDBの独立Entityではない。


---

## 9. ExternalDisplayTarget

TimeTree / Yahoo!カレンダー等のBridge表示設定を保持する。

```text
PK = USER#<userId>
SK = DISPLAY#TIMETREE
```

例:

```json
{
  "PK": "USER#abc123",
  "SK": "DISPLAY#TIMETREE",
  "entityType": "ExternalDisplayTarget",
  "target": "TIMETREE",
  "enabled": true,
  "physicalCalendarId": "pc_private",
  "setupConfirmed": true,
  "updatedAt": "..."
}
```

このEntityは、Schedule HubからTimeTree/YahooへAPI通信するためのものではなく、Web設定とBridge表示先を管理するために使用する。

---

## 10. CreateOperation

予定作成操作1回を表す。

```text
PK = OP#<operationId>
SK = META
```

例:

```json
{
  "PK": "OP#op_01",
  "SK": "META",
  "entityType": "CreateOperation",
  "operationId": "op_01",
  "userId": "abc123",
  "title": "顧客との定例",
  "start": "2026-08-14T10:00:00+09:00",
  "end": "2026-08-14T11:00:00+09:00",
  "timezone": "Asia/Tokyo",
  "destinationIds": ["work"],
  "status": "PROCESSING",
  "eventHash": "...",
  "createdAt": "2026-08-13T13:20:00+09:00",
  "updatedAt": "2026-08-13T13:20:00+09:00",
  "GSI1PK": "USER#abc123",
  "GSI1SK": "OP#2026-08-13T13:20:00+09:00#op_01"
}
```

状態:

```text
PROCESSING
  ├ SUCCESS
  ├ PARTIAL_SUCCESS
  └ FAILED
```

---

## 11. ExternalEvent

1つのCreateOperationから各Physical Calendarへ作成された外部イベントを表す。

```text
PK = OP#<operationId>
SK = EVENT#<physicalCalendarId>
```

例:

```json
{
  "PK": "OP#op_01",
  "SK": "EVENT#pc_work",
  "entityType": "ExternalEvent",
  "physicalCalendarId": "pc_work",
  "provider": "GOOGLE",
  "externalEventId": "google-event-xxxx",
  "status": "SUCCESS",
  "errorCode": null,
  "createdAt": "..."
}
```

将来Providerが追加されても `provider` と `externalEventId` で共通的に扱う。

---

## 12. OAuthState

Google等のOAuth Authorization Code Flowで、認可画面へのリダイレクト開始からcallbackまでの間だけ保持する一時データである。

```text
PK = OAUTHSTATE#<state>
SK = META
```

例:

```json
{
  "PK": "OAUTHSTATE#xyz123",
  "SK": "META",
  "entityType": "OAuthState",
  "userId": "abc123",
  "provider": "GOOGLE",
  "purpose": "CALENDAR_CONNECT",
  "createdAt": 1786590000,
  "ttl": 1786590600
}
```

主な用途:

1. OAuth開始時のユーザーとcallbackを対応付ける。
2. callbackがSchedule Hub自身が開始したOAuthフローのものであることを確認する。
3. CSRF等による不正なcallbackを拒否する。
4. 複数Provider対応時に、どのProviderへの接続処理だったかを復元する。
5. 必要に応じてOAuth完了後の遷移先等の一時情報を保持する。

`state` は十分にランダムな値を生成する。callback時にはURLから受け取ったstateをキーにOAuthStateを取得し、存在、userId、provider、期限等を検証する。

OAuthStateは長期保存するデータではないためTTLを設定し、OAuth完了後は削除してよい。

なお本設計はDynamoDB 1テーブル構成のため、OAuthStateは独立した「OAuthStateテーブル」ではなく、`ScheduleHub` テーブル内のItem種別である。

---

## 13. GSI1

CreateOperationのユーザー別履歴取得用。

```text
GSI1PK = USER#<userId>
GSI1SK = OP#<createdAt>#<operationId>
```

Projection候補:

- operationId
- status
- title
- start
- end
- createdAt
- destinationIds

---

## 14. 主要アクセスパターン

| AP | アクセス | DynamoDB操作 |
|---|---|---|
| AP-01 | UserPreference取得 | `GetItem(USER#, PROFILE)` |
| AP-02 | CalendarConnection一覧 | `Query USER#, begins_with(CONN#)` |
| AP-03 | Physical Calendar一覧 | `Query USER#, begins_with(PCAL#)` |
| AP-04 | Logical Destination一覧 | `Query USER#, begins_with(DEST#)` |
| AP-05 | Destination + Mapping取得 | `GetItem(USER#, DEST#id)` |
| AP-06 | PhysicalCalendar→Connection取得 | `GetItem PCAL#` → `GetItem CONN#` |
| AP-07 | Operation取得 | `GetItem(OP#, META)` |
| AP-08 | 最近のOperation一覧 | `Query GSI1PK=USER#...` |
| AP-09 | ExternalEvent一覧 | `Query OP#, begins_with(EVENT#)` |
| AP-10 | OAuthState取得 | `GetItem(OAUTHSTATE#, META)` |

---

## 15. 冪等性

CreateOperation開始時に、

```text
PK = OP#<operationId>
SK = META
```

を `attribute_not_exists(PK)` 条件付きでPutする。

既存Operationが存在する場合はGoogle Calendar APIを再実行せず、既存結果を確認する。

Google側のEvent IDも `operationId + physicalCalendarId` 等から決定可能な値にして二重登録防止を補強する。

---

## 16. 書き込み整合性

Google Calendar登録完了後は、CreateOperationの最終statusと各ExternalEvent結果を `TransactWriteItems` でまとめて保存することを推奨する。

例:

```text
Update OP#op_01 / META → SUCCESS
Put    OP#op_01 / EVENT#pc_work
Put    OP#op_01 / EVENT#pc_private
```

---

## 17. TTL

`ttl` はOAuthState等の一時Itemにのみ使用する。

予定日時はISO-8601 String、TTLやAccess Token有効期限はUnix Epoch Seconds Numberで保持する。

TTLによる物理削除は即時とは限らないため、有効期限判定はアプリケーション側でも行う。

---

## 18. 削除方針

LogicalDestinationやPhysicalCalendarは、過去Operationとの参照関係を保持するため、可能な限り論理無効化を使用する。

例:

```text
LogicalDestination.enabled = false
PhysicalCalendar.status = DELETED
PhysicalCalendar.writable = false
```

CreateOperation / ExternalEventはMVPでは保持する。

---

## 19. Provider追加時の拡張イメージ

MVP:

```text
CalendarConnection
  └ provider = GOOGLE

PhysicalCalendar
  ├ provider = GOOGLE
  └ connectionId = conn_google_01
```

Outlook追加後:

```text
CalendarConnection
  ├ provider = GOOGLE
  └ provider = MICROSOFT_OUTLOOK

PhysicalCalendar
  ├ provider = GOOGLE
  │  connectionId = conn_google_01
  │
  └ provider = MICROSOFT_OUTLOOK
     connectionId = conn_outlook_01
```

アプリケーション層では、

```text
provider
  ↓
CalendarAdapterFactory
  ├ GOOGLE             → GoogleCalendarAdapter
  └ MICROSOFT_OUTLOOK  → OutlookCalendarAdapter
```

のようにProvider固有実装へ振り分ける。

このため、Google以外のAPI連携追加時にPhysicalCalendarの基本SchemaやLogicalDestinationの構造を変更する必要はない。
