# Schedule Hub 主要シーケンス設計

## 1. 目的
Schedule Hub MVPにおける主要な処理シーケンスを定義する。

対象は以下の7シーケンスとする。

| ID | シーケンス |
|---|---|
| SQ-01 | 初回Schedule Hubサインイン |
| SQ-02 | Google Calendar接続 |
| SQ-03 | ClaudeからRemote MCP接続 |
| SQ-04 | get_schedule_context |
| SQ-05 | create_schedule 正常系 |
| SQ-06 | create_schedule 部分失敗・再試行 |
| SQ-07 | Google Calendar再接続 |

## 2. SQ-01 初回Schedule Hubサインイン

```text
User
  ↓ Schedule Hubへアクセス
Web SPA
  ↓ Googleでサインイン
Cognito / Google
  ↓ 認証済みユーザー情報
Web SPA
  ↓ GET /api/v1/me
Web API
  ↓ USER#sub / PROFILE取得
DynamoDB
  ↓
PROFILEなし: 初期PROFILE作成
PROFILEあり: 既存PROFILE返却
  ↓
Web SPA
```

設計ポイント:
- 独自の新規登録フォームは持たない。
- 初回Googleサインイン時にSchedule Hubユーザーを識別する。
- CognitoのsubをSchedule HubのuserIdとして利用する。
- PROFILEが存在しない場合は初回APIアクセス時に生成する。

## 3. SQ-02 Google Calendar接続

```text
User
  ↓ Google Calendarを接続
Web SPA
  ↓ 接続開始API
Google連携処理
  ↓ 一時状態保存
DynamoDB
  ↓ Googleへ遷移
Google
  ↓ ユーザーがCalendar利用を許可
  ↓ callback
Google連携処理
  ↓ 一時状態検証
  ↓ CalendarConnection保存
DynamoDB
  ↓ Calendar一覧取得
Google Calendar API
  ↓ PhysicalCalendar保存
DynamoDB
  ↓ 接続完了
Web SPA
```

設計ポイント:
- Schedule HubログインとCalendar連携は別フローとする。
- CalendarConnectionはSchedule Hub User配下に保持する。
- Google Calendar一覧はPhysicalCalendarとして同期する。
- callback用の一時状態は開始ユーザーと接続処理を対応付けるために利用する。

## 4. SQ-03 ClaudeからRemote MCP接続

```text
User
  ↓ ClaudeでSchedule Hub Connectorを接続
Claude
  ↓ Schedule Hub MCPへアクセス
Schedule Hub MCP
  ↓ ユーザー認証へ誘導
Cognito / Google
  ↓ 認証成功
Claude
  ↓ 認証済みMCPアクセス
Schedule Hub MCP
  ↓ Cognito sub取得
Schedule Hub User特定
```

設計ポイント:
- WebとMCPは同一Cognito User Poolを利用する。
- Web用とMCP用のApp Clientは分離する。
- WebとClaudeで同じCognito subとなるため、Webで設定したユーザー設定をMCPから参照できる。

## 5. SQ-04 get_schedule_context

```text
User
  ↓ 自然言語で予定を伝える
Claude
  ↓ get_schedule_context
MCP Lambda
  ↓ Cognito sub取得
  ├ PROFILE取得
  └ DEST#*取得
DynamoDB
  ↓ Schedule Context返却
Claude
  ↓ 日時・Logical Destinationを判断
```

返却対象:
- currentDateTime
- timezone
- defaultDurationMinutes
- defaultDestinationIds
- Logical Destination ID
- Destination名称
- Alias
- 用途説明

ClaudeにはPhysicalCalendar、CalendarConnection、Provider上のCalendar IDは返さない。

## 6. SQ-05 create_schedule 正常系

```text
Claude
  ↓ create_schedule
MCP Lambda
  ↓ 認証ユーザー取得
  ↓ 入力検証
  ↓ Operation冪等チェック
DynamoDB
  ↓ PROFILE取得
  ↓ Logical Destination取得
  ↓ Physical Calendar解決
  ↓ Physical Calendar重複排除
  ↓ CalendarConnection解決
DynamoDB
  ↓ Provider API呼び出し
Google Calendar API
  ↓ 作成結果
MCP Lambda
  ↓ ExternalEvent保存
  ↓ CreateOperation更新
DynamoDB
  ↓ success
Claude
  ↓
User
```

処理順:
1. Authentication
2. Input Validation
3. Idempotency
4. Default補完
5. Destination validation
6. Logical to Physical resolution
7. Physical Calendar deduplication
8. CalendarConnection resolution
9. Provider API call
10. ExternalEvent保存
11. Operation集約
12. MCP Response

終了時刻が未指定の場合はUser ProfileのdefaultDurationMinutesを用いて補完する。

## 7. 複数Destination時の重複排除

例:

```text
dest_work
  → pcal_A
  → pcal_B

dest_private
  → pcal_B
  → pcal_C
```

最終登録対象:

```text
pcal_A
pcal_B
pcal_C
```

同一Physical Calendarへ同一予定を複数回作成しない。

## 8. SQ-06 部分失敗・再試行

部分失敗:

```text
create_schedule
  ↓
Physical Calendar A → SUCCESS
Physical Calendar B → FAILED
  ↓
ExternalEvent A = SUCCESS
ExternalEvent B = FAILED
  ↓
CreateOperation = PARTIAL_SUCCESS
  ↓
Claudeへpartial_successを返却
```

再試行:

```text
同一operationId
  ↓
SUCCESS     → Provider APIを再実行せず既存結果を返す
PROCESSING  → 処理中として返す
未存在      → 新規処理開始
```

同じoperationIdで異なる予定内容が送られた場合は競合として扱う。

## 9. SQ-07 Google Calendar再接続

```text
Claude
  ↓ create_schedule
MCP Lambda
  ↓ CalendarConnection取得
  ↓ Google Calendar API呼び出し
Google
  ↓ 接続の再確立が必要なエラー
MCP Lambda
  ↓ CalendarConnectionをREAUTH_REQUIREDへ更新
DynamoDB
  ↓ PROVIDER_AUTH_EXPIRED
Claude
  ↓ Schedule Hub Webで再接続を案内
User
```

Web側で再接続するとSQ-02と同等の接続フローを行い、CalendarConnectionを復旧する。LogicalDestinationとPhysicalCalendarの対応は可能な限り維持する。

## 10. シーケンス間の関係

初回利用:

```text
SQ-01 Schedule Hubサインイン
  ↓
SQ-02 Google Calendar接続
  ↓
Logical Destination設定
  ↓
SQ-03 Claude MCP接続
```

通常利用:

```text
SQ-04 get_schedule_context
  ↓
Claudeによる自然言語解釈
  ↓
SQ-05 create_schedule
```

異常系:

```text
SQ-06 部分失敗・再試行
SQ-07 Provider再接続
```

## 11. 責務境界

Claude:
- 自然言語解釈
- 相対日時の解決
- タイトル生成
- Logical Destination判定
- 曖昧な場合のユーザー確認

Schedule Hub:
- 認証ユーザー特定
- 入力検証
- Logical Destination検証
- LogicalからPhysical Calendarへの解決
- 重複排除
- Provider接続解決
- Calendar API呼び出し
- 冪等制御
- 部分成功集約
- 操作履歴保存

Provider:
- 実イベントの保存
