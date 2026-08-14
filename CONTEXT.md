# Schedule Hub ドメイン

Schedule Hubは、ユーザーが設定したLogical Destinationを介して、Claudeの自然言語による予定作成をGoogle Calendarへ接続するサービス。

## 用語

**User（ユーザー）**:
Cognitoのsubクレームで識別されるSchedule Hubのアカウント。
_Avoid_: Google account、Calendar account

**Logical Destination（論理登録先）**:
仕事やプライベートなど、ユーザーが意味として選択する登録先。Claudeが選択し、Schedule Hubが1つ以上のPhysical Calendarへ解決する。
_Avoid_: Physical Calendar、mapping target

**Physical Calendar（物理カレンダー）**:
Schedule Hubが書き込み可能なProvider側カレンダー。内部では不変のSchedule Hub IDとProvider側カレンダーIDで表現する。
_Avoid_: Logical Destination、Bridge Calendar

**Calendar Connection（カレンダー接続）**:
UserとカレンダーProviderの認証済み接続。Google Calendarの認可はSchedule Hubへのサインインとは分離する。
_Avoid_: Login session

**Create Operation（作成操作）**:
1つの予定作成意図を表す単位。operationIdで識別し、対象となるすべてのPhysical Calendarに対する結果を追跡する。
_Avoid_: request、event

**External Event（外部イベント）**:
1つのCreate Operationを1つのPhysical Calendarへ登録した結果。
_Avoid_: schedule operation

**Bridge Calendar（ブリッジカレンダー）**:
外部カレンダーアプリに予定を表示するために選択したGoogle Calendar。Schedule Hubは外部アプリへ直接書き込まない。
_Avoid_: external integration calendar
