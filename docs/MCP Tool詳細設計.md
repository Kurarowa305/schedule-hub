# Schedule Hub MCP Tool詳細設計

## 1. 目的

本書は、Schedule Hub MVPでClaude公式チャットから利用するMCP Toolの詳細仕様を定義する。

本書の「1.1 正式Tool Schema」をMVPのMCP Tool Schemaの正本とする。API設計、データフロー、要件、実装チケットは本節に従う。

## 1.1 正式Tool Schema

### 共通規約

- JSON Schema Draft 2020-12を使用する。
- Schedule Hub側の内部IDはprefix付きULIDとする。operationIdはClaudeが予定作成意図ごとに生成し、同じ意図の再試行で再利用する。
- 成功・状態のenumは大文字で統一する。
- Tool Inputにtimezoneは含めず、認証ユーザーのUserPreferenceを使用する。

### get_schedule_context

入力は空のobjectとし、追加プロパティを許可しない。出力はcurrentDateTime、timezone、defaultDurationMinutes、defaultDestinationIds、destinationsを必須とする。currentDateTimeはUserPreferenceのIANA Time Zoneへ変換したRFC3339日時である。defaultDurationMinutesは1から1440分とする。

destinationsは最大50件とし、各要素はid、name、aliases、descriptionを必須とする。aliasesは最大20件、1件あたり50文字、descriptionは最大500文字とする。無効なDestination、Physical Calendar ID、Provider Calendar ID、Connection ID、Googleアカウント識別子、Access Token、Refresh Tokenは返さない。

### create_scheduleの入力

必須項目はoperationId、title、scheduleType、start、destinationIds、destinationInferenceである。operationIdは正規表現 ^op_[0-9A-HJKMNP-TV-Z]{26}$ に適合する。titleは1から200文字、destinationIdsは1から50件の重複なし配列とする。

scheduleTypeはTIMEDまたはALL_DAYである。TIMEDのstartはRFC3339日時で、end未指定時はUserPreferenceのdefaultDurationMinutesを適用する。ALL_DAYのstartとendは日付で、endはユーザー視点のinclusiveな最終日として受け取り、Providerにはexclusiveな終了日へ変換する。

locationは最大500文字、descriptionは最大5000文字、assumptionsは最大20件かつ各500文字、sourceTextは最大2000文字とする。destinationInferenceはtypeとreasonを必須とし、typeはEXPLICIT、ALIAS_MATCH、SEMANTIC_INFERENCE、DEFAULT、CONFIRMED_BY_USERのいずれか、reasonは最大500文字とする。

### create_scheduleの出力とエラー

出力の必須項目はoperationId、status、replayed、schedule、destinationsである。statusはSUCCESS、PARTIAL_SUCCESS、FAILEDのいずれかとする。scheduleはtitle、scheduleType、start、end、timezoneを必須とする。各Destination結果はid、name、status、errorCodeを必須とし、statusはCREATED、PARTIAL_SUCCESS、FAILEDのいずれかとする。

JSON-RPCのプロトコルエラーと業務エラーを分離する。業務エラーはisError=trueのTool Resultで返し、代表コードはINVALID_DATETIME、INVALID_DESTINATION、DESTINATION_DISABLED、NO_WRITABLE_CALENDAR、PROVIDER_AUTH_EXPIRED、PROVIDER_API_ERROR、OPERATION_ID_CONFLICTとする。



対象Toolは以下の2つとする。

| Tool | 種別 | 役割 |
|---|---|---|
| `get_schedule_context` | Read | Claudeが予定を解釈するためのユーザー設定・Logical Destination取得 |
| `create_schedule` | Write | 解釈済みの予定をLogical Destination経由でPhysical Calendarへ登録 |

基本責務は以下のとおり。

```text
Claude
- 自然言語解釈
- 相対日時の解決
- タイトル生成
- TIMED / ALL_DAY判定
- Logical Destination判定
- Alias判定
- Semantic inference
- 曖昧な場合のユーザー確認
- operationId生成

Schedule Hub
- 認証ユーザー特定
- Tool Input Validation
- Logical Destination存在・所有・有効性確認
- Logical Destination → Physical Calendar解決
- Physical Calendar重複排除
- CalendarConnection取得
- Provider OAuth Token処理
- Provider API呼び出し
- デフォルト終了時刻補完
- 冪等制御
- PARTIAL_SUCCESS判定
- 操作履歴保存
```

---

## 2. Tool利用フロー

```text
User
  │
  │ 自然言語
  ▼
Claude
  │
  │ get_schedule_context
  ▼
Schedule Hub
  │
  │ timezone / currentDateTime / defaults / destinations
  ▼
Claude
  │
  │ 予定内容・日時・Destinationを確定
  │
  ├─ 曖昧 → Userへ確認
  │
  └─ 一意 → create_schedule
            │
            ▼
        Schedule Hub
            │
            ├ Logical Destination検証
            ├ Physical Calendar解決
            ├ 重複排除
            ├ Provider API
            └ Operation保存
            │
            ▼
          Claude
            │
            ▼
           User
```

---

# 3. get_schedule_context

## 3.1 役割

Claudeが予定登録前に以下を把握するために利用する。

- 現在日時
- ユーザーのタイムゾーン
- デフォルト所要時間
- デフォルトLogical Destination
- 利用可能なLogical Destination
- Destination名称
- Alias
- 用途説明

予定作成処理自体は行わない。

## 3.2 Tool Definition

```json
{
  "name": "get_schedule_context",
  "title": "Get Schedule Context",
  "description": "予定の日時と登録先を判断するために、認証ユーザーのSchedule Hub設定を取得します。予定を作成する前に、現在時刻、タイムゾーン、デフォルト所要時間、デフォルト登録先、利用可能なLogical DestinationのID・名称・Alias・用途を確認するために使用してください。Physical Calendar IDやProvider上のCalendar IDは返しません。",
  "inputSchema": {
    "type": "object",
    "additionalProperties": false
  },
  "annotations": {
    "readOnlyHint": true,
    "destructiveHint": false,
    "idempotentHint": true,
    "openWorldHint": false
  }
}
```

## 3.3 Input

パラメータなし。

認証ユーザーはMCP Access Tokenから特定し、Tool Inputに`userId`を持たせない。

## 3.4 Output

```json
{
  "currentDateTime": "2026-08-13T19:00:00+09:00",
  "timezone": "Asia/Tokyo",
  "defaultDurationMinutes": 120,
  "defaultDestinationIds": [
    "dest_private"
  ],
  "destinations": [
    {
      "id": "dest_private",
      "name": "プライベート",
      "aliases": ["個人", "自分"],
      "description": "個人的な予定。美容院、買い物、友人との予定など。"
    },
    {
      "id": "dest_work",
      "name": "仕事",
      "aliases": ["仕事", "会社", "業務", "work"],
      "description": "仕事に関する予定。会議、出社、顧客対応、研修など。"
    },
    {
      "id": "dest_couple",
      "name": "二人の予定",
      "aliases": ["彼女", "二人", "デート"],
      "description": "恋人と一緒に行う予定。食事、旅行、デートなど。"
    }
  ]
}
```

## 3.5 currentDateTime

`currentDateTime`は、Claudeが以下の相対表現をSchedule HubユーザーのTimezone基準で絶対日時へ解決するために返す。

- 明日
- 明後日
- 今週土曜日
- 来週月曜日
- 来月5日

Claude自身の時刻認識ではなく、Schedule Hubが返す`currentDateTime`と`timezone`を予定解釈の基準とする。

## 3.6 Claudeへ返さない情報

以下はMCP Toolへ公開しない。

- Physical Calendar ID
- Provider側Calendar ID
- CalendarConnection ID
- Google Account ID
- OAuth Access Token
- OAuth Refresh Token
- TimeTree / Yahoo Bridge内部構成

責務境界:

```text
Claude
  Logical Destinationまで

Schedule Hub
  Physical Calendar以降
```

---

# 4. Logical Destination判定ルール

Claudeは以下の優先順位でDestinationを決定する。

```text
1. EXPLICIT
   ユーザーがDestination名称を明示

2. ALIAS_MATCH
   Destination Aliasに明確に一致

3. SEMANTIC_INFERENCE
   予定内容とDestination用途説明から合理的に推測

4. DEFAULT
   登録先情報が存在しない場合にdefaultDestinationIdsを利用

5. CONFIRMED_BY_USER
   複数候補等でClaudeが質問し、ユーザー回答によって確定
```

例:

| 発話 | Destination | inference type |
|---|---|---|
| 「仕事カレンダーに入れて」 | `dest_work` | `EXPLICIT` |
| 「会社の予定に入れて」 | `dest_work` | `ALIAS_MATCH` |
| 「顧客との定例」 | `dest_work` | `SEMANTIC_INFERENCE` |
| 「明日美容院」 | default Destination | `DEFAULT` |
| 「共有カレンダーに入れて」＋候補複数 | createしない | ユーザー確認 |
| 確認後「仕事で」 | `dest_work` | `CONFIRMED_BY_USER` |

---

# 5. create_schedule

## 5.1 役割

Claudeが自然言語の解釈を完了した予定をSchedule Hubへ登録する。

`create_schedule`自身は自然言語解釈を担当しない。

```text
Claude
自然言語 → 構造化データ

Schedule Hub
構造化データ → 検証・登録
```

## 5.2 Tool Description

```text
認証ユーザーのカレンダーへ予定を新規作成します。

このToolを呼ぶ前に、予定タイトル、開始日時、およびLogical Destinationを一意に決定してください。

登録先の判断にはget_schedule_contextで取得したDestinationのみを使用し、存在しないDestination IDやPhysical Calendar IDを生成してはいけません。

ユーザーの発話に登録先情報がない場合は、get_schedule_contextのdefaultDestinationIdsを使用してください。

開始日時や登録先が複数の意味に解釈できる場合は、このToolを呼ばず、先にユーザーへ確認してください。

終了時刻が指定されていないことだけを理由に確認してはいけません。Schedule HubがユーザーのdefaultDurationMinutesを使用して補完します。
```

## 5.3 Tool Input例

```json
{
  "operationId": "op_01JXYZ...",
  "title": "顧客との定例",
  "scheduleType": "TIMED",
  "start": "2026-08-14T10:00:00+09:00",
  "end": null,
  "destinationIds": [
    "dest_work"
  ],
  "location": null,
  "description": null,
  "destinationInference": {
    "type": "SEMANTIC_INFERENCE",
    "reason": "「顧客との定例」という内容が仕事Destinationの用途と明確に一致するため"
  }
}
```

---

# 6. create_schedule Input Schema

正式なInput Schemaは「1.1 正式Tool Schema」の「create_scheduleの入力」に定義する。本節では別のJSON Schemaを重複定義しない。

# 7. destinationIds

`destinationIds`は必須かつ1件以上とする。

Schedule Hub側で空配列をデフォルトDestinationへ暗黙変換しない。

```text
登録先指定なし
      │
      ▼
Claude
      │
      ├ get_schedule_context
      │
      └ defaultDestinationIdsを取得
      │
      ▼
create_schedule
 destinationIds=[default]
```

これにより、Claudeが最終的に選択したDestinationをTool Inputだけで確認できる。

---

# 8. scheduleType

MVPでは以下の2種類とする。

```text
TIMED
ALL_DAY
```

## 8.1 TIMED

```json
{
  "scheduleType": "TIMED",
  "start": "2026-08-14T10:00:00+09:00",
  "end": null,
  "timezone": "Asia/Tokyo"
}
```

`end=null`の場合、Schedule Hubが、

```text
end = start + defaultDurationMinutes
```

として補完する。

## 8.2 ALL_DAY

1日の終日予定:

```json
{
  "scheduleType": "ALL_DAY",
  "start": "2026-08-14",
  "end": null,
  "timezone": "Asia/Tokyo"
}
```

`end=null`の場合は1日として扱う。

複数日の終日予定:

```json
{
  "scheduleType": "ALL_DAY",
  "start": "2026-08-14",
  "end": "2026-08-16",
  "timezone": "Asia/Tokyo"
}
```

MCP Tool上の`end`はユーザー視点の最終日を表すinclusiveな値として扱い、Provider API固有の終了日仕様への変換はCalendar Adapterで行う。

---

# 9. Claudeの確認ルール

## 9.1 ユーザー確認しないケース

以下はClaudeまたはSchedule Hubのデフォルトで解決するため、原則として質問しない。

| 状況 | 処理 |
|---|---|
| 終了時刻なし | `defaultDurationMinutes`を使用 |
| Timezone未明示 | contextの`timezone`を使用 |
| 登録先情報なし | `defaultDestinationIds`を使用 |
| タイトルが自然に生成可能 | Claudeが簡潔なタイトル生成 |
| 「明日」 | `currentDateTime`から日付解決 |
| 「次の土曜日」 | `currentDateTime`から日付解決 |

## 9.2 ユーザー確認するケース

| 発話例 | 確認理由 |
|---|---|
| 「来週飲みに行く」 | 日付が一意でない |
| 「明日飲みに行く」 | 開始時刻がない |
| 「夕方に美容院」 | 具体的開始時刻がない |
| 「共有カレンダーに入れて」 | Destination候補が複数 |
| 「15日か16日に会議」 | 日付が一意でない |

判断基準は、予定を実際のCalendar上の日時へ一意に配置できるかどうかとする。

---

# 10. Schedule Hub側Validation

Claudeの判断結果をそのまま信用せず、Schedule Hubで必ず再検証する。

```text
create_schedule
      │
      ├ operationId検証
      ├ title検証
      ├ scheduleType検証
      ├ start / end検証
      ├ timezone検証
      ├ destinationIds検証
      ├ Destination所有確認
      ├ Destination enabled確認
      ├ Physical Calendar解決
      ├ Physical Calendar重複排除
      ├ writable確認
      └ Provider API
```

存在しないDestination IDを受け取った場合は`INVALID_DESTINATION`とする。

---

# 11. operationId / 冪等性

`operationId`は必須とする。

Claudeは1つの「予定作成意思」に対して1つのoperationIdを生成する。

```text
ユーザー
「明日10時から定例入れて」
       │
       ▼
operationId = op_A
```

通信失敗等で同一操作を再試行する場合は同じoperationIdを再利用する。

## 11.1 同じoperationId + 同じPayload

既存Operationの結果を返し、Provider APIを再実行しない。

Responseに以下を含めてもよい。

```json
{
  "replayed": true
}
```

## 11.2 同じoperationId + 異なるPayload

以下を返す。

```text
OPERATION_ID_CONFLICT
```

operationIdの誤再利用として扱う。

---

# 12. create_schedule Output

ClaudeへはLogical Destination単位の結果を返し、Physical CalendarやProvider内部IDは返さない。

成功例:

```json
{
  "operationId": "op_01JXYZ...",
  "status": "SUCCESS",
  "replayed": false,
  "schedule": {
    "title": "顧客との定例",
    "scheduleType": "TIMED",
    "start": "2026-08-14T10:00:00+09:00",
    "end": "2026-08-14T12:00:00+09:00",
    "timezone": "Asia/Tokyo"
  },
  "appliedDefaults": ["end"],
  "destinations": [
    {
      "id": "dest_work",
      "name": "仕事",
      "status": "created"
    }
  ],
  "warnings": []
}
```

Tool Inputで`end=null`だった場合でも、Outputには実際に登録した確定終了時刻を返す。

---

# 13. Partial Success

同一Logical Destinationが複数Physical Calendarへ解決され、一部のみ作成成功した場合は`partial_success`とする。

```json
{
  "operationId": "op_...",
  "status": "PARTIAL_SUCCESS",
  "replayed": false,
  "destinations": [
    {
      "id": "dest_work",
      "name": "仕事",
      "status": "PARTIAL_SUCCESS"
    }
  ],
  "warnings": [
    {
      "code": "PROVIDER_API_ERROR",
      "message": "仕事の登録先の一部で予定を作成できませんでした。"
    }
  ]
}
```

Providerの生エラーメッセージや内部IDはClaudeへ返さない。

---

# 14. Tool Error設計

Tool呼び出し自体は成立しているが、業務上処理できない場合はTool Errorとして返す。

代表Error:

| Error Code | 意味 | Claudeの期待動作 |
|---|---|---|
| `INVALID_DATETIME` | 日時不正 | 必要に応じてユーザー確認 |
| `INVALID_DESTINATION` | Destination不存在 | context再取得 |
| `DESTINATION_DISABLED` | Destination無効化済み | context再取得 |
| `NO_WRITABLE_CALENDAR` | 書込可能Calendarなし | Web設定確認案内 |
| `PROVIDER_AUTH_EXPIRED` | Calendar Provider認証失効 | Webで再接続案内 |
| `PROVIDER_API_ERROR` | Provider API失敗 | 再試行候補 |
| `OPERATION_ID_CONFLICT` | operationId誤再利用 | 新operationIdで再構成 |

例:

```json
{
  "content": [
    {
      "type": "text",
      "text": "The selected destination is no longer available. Call get_schedule_context again before retrying."
    }
  ],
  "structuredContent": {
    "error": {
      "code": "INVALID_DESTINATION",
      "message": "選択された登録先は現在利用できません。",
      "action": "REFETCH_SCHEDULE_CONTEXT"
    }
  },
  "isError": true
}
```

---

# 15. Tool Result方針

Tool Resultは`structuredContent`を正本とする。

```text
structuredContent
  Claude / MCP Clientが扱う構造化結果

content.text
  人間可読メッセージ・互換用
```

`outputSchema`を定義する場合、`structuredContent`はそのSchemaへ適合させる。

---

# 16. Tool Annotations

## get_schedule_context

```json
{
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## create_schedule

```json
{
  "readOnlyHint": false,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": true
}
```

`create_schedule`は外部Calendarへ新規イベントを追加するが、既存イベントを削除・上書きしないため`destructiveHint=false`とする。

冪等性はoperationIdで保証するため`idempotentHint=true`とする。

---

# 17. 通常利用例

ユーザー:

```text
明日10時から顧客との定例
```

処理:

```text
Claude
  │
  ├ get_schedule_context
  │
  ▼
Schedule Hub
  │
  ├ currentDateTime
  ├ timezone=Asia/Tokyo
  ├ defaultDurationMinutes=120
  └ destinations
  │
  ▼
Claude
  │
  ├ 明日 → 絶対日付へ変換
  ├ 10時 → start確定
  ├ end未指定 → null
  ├ 「顧客との定例」 → dest_work
  └ operationId生成
  │
  ├ create_schedule
  ▼
Schedule Hub
  │
  ├ end=null → start+120分
  ├ dest_work検証
  ├ Physical Calendar解決
  ├ Provider API
  └ Operation保存
  │
  ▼
Claude
  │
  ▼
User
「明日10時〜12時で、仕事カレンダーに『顧客との定例』を登録しました。」
```

---

# 18. 設計上の重要事項

1. ClaudeはLogical Destinationまでを扱い、Physical Calendarを知らない。
2. `get_schedule_context`は予定解釈に必要な最小情報のみ返す。
3. 登録先指定なしの場合もClaudeが`defaultDestinationIds`を明示的に`create_schedule`へ渡す。
4. 終了時刻未指定はSchedule Hub側でデフォルト補完し、Claudeは確認しない。
5. 日時・Destinationが一意でない場合のみClaudeがユーザーへ確認する。
6. Claudeが渡したDestinationはSchedule Hub側で必ず再検証する。
7. operationIdによってTool再実行時の二重登録を防止する。
8. Provider内部情報・OAuth TokenはMCP境界の外へ出さない。
9. create結果はLogical Destination単位で返す。
10. 将来的なupdate/delete/search Tool追加時も、Logical DestinationとPhysical Calendarの責務境界を維持する。
