# Schedule Hub 認証・OAuth詳細設計

## 1. 目的
Schedule Hub MVPにおける以下3系統の認証・OAuthを定義する。

1. Schedule Hub Webへのサインイン
2. Google Calendar API利用のためのGoogle OAuth
3. Claude公式チャットからRemote MCPへ接続するための認証

## 2. 基本方針
- Schedule Hubへのサインインは「Googleでサインイン」のみとする。
- 独自メール＋パスワード登録はMVPでは提供しない。
- ユーザー管理はAmazon Cognito User Poolを利用する。
- GoogleサインインはCognitoのGoogle Social IdPを利用する。
- Schedule HubのuserIdはCognitoのsubを利用する。
- Google Calendar権限はSchedule Hubログインとは別のGoogle OAuthで取得する。
- WebとMCPは同一Cognito User Poolを利用するが、App Clientは分離する。
- Login用Google OAuth ClientとCalendar連携用Google OAuth Clientは分離する。
- Google Calendar接続情報はAWS内部のみで扱い、Claudeへ公開しない。

## 3. 認証全体像
```text
Google
├─ Login OAuth ─→ Cognito ─→ Web SPA / Claude
└─ Calendar OAuth ─→ CalendarConnection ─→ Google Calendar

Web SPA / Claude
        ↓ Cognito sub
Schedule Hub User
        ├─ LogicalDestination
        └─ CalendarConnection
```

## 4. Schedule Hubへのサインイン
### 4.1 UX
UI上は「Googleでサインイン」の1操作のみとする。
初回利用時はCognito User Pool内にFederated Userが作成され、それをSchedule Hubユーザーとして扱う。
2回目以降は同一ユーザーとしてログインする。

### 4.2 Web認証フロー
```text
Browser
→ Cognito Authorization Endpoint
→ Google
→ Cognito
→ Authorization Code
→ Browser
→ PKCE
→ Cognito Token Endpoint
→ Web API
```

### 4.3 Web App Client
- Public Client
- Client Secretなし
- Authorization Code Grant
- PKCE必須
- Google IdPのみ

### 4.4 Login Scope
```text
openid
email
profile
```
Calendar権限はこのフローでは取得しない。

## 5. Schedule Hub User
Cognito subをSchedule Hub userIdとして利用する。

```text
Cognito sub
→ Schedule Hub userId
→ PK = USER#<sub>, SK = PROFILE
```

メールアドレスをPrimary Keyには使用しない。

認証後、GET /api/v1/meでPROFILEが存在しなければ初期Profileを作成する。

## 6. Google Calendar連携OAuth
### 6.1 分離方針
```text
Schedule Hub Login = Cognito Federation
Google Calendar Connection = Direct Google OAuth
```

これにより、サインインに利用したGoogleアカウントとCalendar連携に利用するGoogleアカウントの一致は強制しない。

### 6.2 Calendar OAuth開始
```text
Browser
→ POST /api/v1/calendar-connections/GOOGLE/oauth/start
→ Google OAuth Lambda
→ OAuthState生成・保存
→ Google Authorization Endpoint
```

### 6.3 Calendar Scope
MVPでは以下を基本とする。
```text
openid
email
calendar.calendarlist.readonly
calendar.events
```

### 6.4 OAuthState
OAuth開始時にランダムなstateを生成し、DynamoDBへ短期間保存する。

用途:
- OAuth開始ユーザーとcallbackの対応付け
- callbackの正当性確認
- provider / purposeの復元
- CSRF対策

callback後は削除してよい。

### 6.5 Callback
```text
Google
→ GET /api/v1/oauth/GOOGLE/callback
→ OAuthState検証
→ Calendar接続情報取得
→ CalendarConnection保存
→ Calendar一覧取得
→ PhysicalCalendar保存
```

### 6.6 CalendarConnection
論理的には以下を保持する。
```text
connectionId
provider
accountIdentifier
providerCredential
providerRefreshCredential
credentialExpiresAt
status
```

Provider固有の認証情報はAWS内部のみで扱い、APIレスポンスやClaudeへ公開しない。

### 6.7 Calendar一覧同期
OAuth完了後、Google Calendar一覧を取得してPhysicalCalendarとして保存する。

```text
CalendarConnection
→ Google CalendarList
→ PhysicalCalendar
```

PhysicalCalendarには少なくとも以下を保持する。
```text
physicalCalendarId
provider
connectionId
externalCalendarId
name
accessRole
writable
```

## 7. Claude → Remote MCP認証
### 7.1 Cognito構成
```text
Cognito User Pool
├─ ScheduleHubWebClient
└─ ScheduleHubMcpClient
```

WebとMCPでUser Poolは共通、App Clientは分離する。

### 7.2 MCP Resource
```text
https://{apiId}.execute-api.ap-northeast-1.amazonaws.com/mcp
```

### 7.3 MCP Scope
MVPでは単一Scopeとし、get_schedule_context / create_scheduleの両方に利用する。
将来必要になればread/write等へ分割する。

### 7.4 MCP認証フロー
```text
User
→ ClaudeでSchedule Hubを接続
→ ClaudeがMCPへアクセス
→ Schedule Hubが認証先を通知
→ Cognito
→ Googleサインイン
→ Claudeへ認証結果
→ Claudeが認証済みでMCPを呼び出す
→ API Gateway
→ MCP Lambda
```

### 7.5 ユーザー識別
WebとClaudeは同一Cognito User Poolと同一Google IdPを利用するため、同一ユーザーでは同じsubをSchedule Hub userIdとして利用する。

```text
Web Login       sub = abc123
Claude MCP      sub = abc123
                     ↓
                USER#abc123
```

これによりClaudeからWebで設定したLogical Destinationを参照できる。

## 8. Google OAuth Client構成
Google Cloud側では用途ごとにOAuth Clientを分ける。

```text
Google Cloud Project
├─ OAuth Client A: Cognito Googleサインイン用
└─ OAuth Client B: Google Calendar連携用
```

認証とCalendar API認可を明確に分離する。

## 9. ログアウト・解除・再認証
### 9.1 Webログアウト
Cognito Sessionの終了のみとする。

```text
Schedule Hubログアウト ≠ Google Calendar連携解除
```

### 9.2 CalendarConnection解除
ユーザーが明示的にCalendar接続を解除した場合、CalendarConnectionを利用不可状態にし、関連PhysicalCalendarも書き込み不可として扱う。

### 9.3 Provider認可失効
Provider側で再認証が必要になった場合、CalendarConnectionをREAUTH_REQUIRED相当にする。
MCP ToolにはPROVIDER_AUTH_EXPIREDを返し、Schedule Hub Webからの再接続を案内する。

## 10. 認証関連データ
DynamoDBへ保存する認証関連データ:
```text
USER#<sub> / PROFILE
CONN#<connectionId>
OAUTHSTATE#<state> / META
```

CognitoのWeb / MCPセッション情報はDynamoDBへ保存しない。
Calendar Provider用接続情報はCalendarConnectionとしてAWS内部に保持する。

## 11. MVP確定方針
1. Schedule Hub独自のメール＋パスワード登録は作らない。
2. Googleでサインインのみ提供する。
3. 初回Googleログイン時にCognito Federated Userを作成する。
4. Cognito subをSchedule Hub userIdとする。
5. Google Calendar権限はログインとは別OAuthで取得する。
6. Login用Google OAuth ClientとCalendar用Google OAuth Clientを分離する。
7. WebとClaudeは同一Cognito User Poolを利用する。
8. Web App ClientとMCP App Clientは分離する。
9. Calendar Provider用認証情報はAWS内部のみで扱う。
10. Schedule HubログアウトとCalendar接続解除は別操作とする。
11. サインインGoogleアカウントとCalendar連携Googleアカウントの一致は強制しない。
