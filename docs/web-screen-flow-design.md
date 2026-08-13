# Schedule Hub Web画面・画面遷移設計

## 1. 目的
Schedule Hub MVPのWeb設定画面と画面遷移を定義する。Webは予定登録そのものを行う場所ではなく、Claudeから予定登録できる状態を作るための設定画面とする。

## 2. 基本方針
- 初回利用はWizard形式でセットアップする。
- 通常利用ではDashboardから設定・履歴へ遷移する。
- 内部用語はユーザー向け名称へ変換する。
  - LogicalDestination → 登録先
  - PhysicalCalendar → Googleカレンダー / 接続済みカレンダー
  - CalendarConnection → 接続済みGoogleアカウント
- Google Calendarアプリのインストールは必須ではないため、事前インストール案内は行わない。
- GoogleアカウントがあればPrimary Calendarが存在する前提で、Google OAuth後にCalendar一覧を取得する。
- Web上に予定作成フォームは設けない。

## 3. 画面一覧
| ID | 画面 | 用途 |
|---|---|---|
| SCR-01 | サインイン | GoogleでSchedule Hubへログイン |
| SCR-02 | 初回セットアップ | 初期設定の進捗管理 |
| SCR-03 | ダッシュボード | 接続状態・設定状態の確認 |
| SCR-04 | Calendar接続 | Googleアカウント接続管理 |
| SCR-05 | 接続済みカレンダー | 利用可能Calendar確認・個別設定 |
| SCR-06 | 登録先一覧 | Logical Destination一覧 |
| SCR-07 | 登録先編集 | 名称・Alias・用途・Calendar Mapping |
| SCR-08 | 予定デフォルト設定 | 所要時間・Timezone・デフォルト登録先等 |
| SCR-09 | 外部カレンダー表示設定 | TimeTree / Yahoo等の表示設定 |
| SCR-10 | Claude接続 | Remote MCP接続ガイド |
| SCR-11 | 操作履歴 | create_schedule履歴 |
| SCR-12 | アカウント | サインアウト・接続解除等 |

## 4. 初回セットアップ
```text
1. Google Calendar接続
2. 登録先設定
3. 予定設定
4. 外部表示設定
5. Claude接続
6. 完了
```
外部表示設定はスキップ可能とする。

## 5. Google Calendar接続
ユーザー向け文言は「Googleアカウントのカレンダーを接続」を推奨する。Google Calendarアプリのインストールは要求しない。

```text
[Google Calendarを接続]
  ↓
Google OAuth
  ↓
接続完了
```
接続後はアカウント名と検出Calendar数を表示する。複数Googleアカウントを管理可能とし、通常画面では再同期・解除・追加を提供する。

## 6. 接続済みカレンダー
Physical Calendarという技術用語は表示しない。書き込み可能Calendarは登録先Mappingに利用可能とし、閲覧専用Calendarは選択不可表示とする。

表示候補:
- Calendar名
- 所有/アクセス権
- 書き込み可否
- Schedule Hub固有の色設定

## 7. 登録先一覧・編集
登録先はSchedule Hubの中心設定とする。

一覧表示:
- 登録先名
- Alias
- 用途概要
- Mapping先Googleカレンダー
- 有効/無効

編集項目:
```text
名称
Alias
用途説明
登録するGoogleカレンダー
自動判定に使用するか
```
用途説明は「Claude向けPrompt」ではなく「どんな予定に使いますか？」という表現にする。

## 8. 予定デフォルト設定
設定項目:
- timezone
- defaultDurationMinutes
- デフォルト登録先
- Google Calendarイベント色
- 通知
- 公開設定
- free/busy

登録先未指定時:
```text
● 指定した登録先
  ☑ プライベート
  □ 仕事

○ 有効なすべての登録先
```

## 9. 外部カレンダー表示設定
TimeTree / Yahoo等は直接API連携ではないため「外部カレンダー表示」として区別する。

表示内容:
- 利用する/しない
- 表示元Google Calendar
- 設定手順
- 端末設定済み自己申告

TimeTree共有カレンダーへの直接登録には対応しない旨を明示する。

## 10. Claude接続
表示内容:
- MCP URL
- Claude Connector設定手順
- Schedule Hub認証案内
- テスト発話例

例:
```text
「明日の18時から飲みに行く予定を入れて」
```
Claude UI変更に備え、固定スクリーンショット依存を避ける。

## 11. Dashboard
表示候補:
- Google接続状態
- 登録先件数
- Claude接続ガイド
- 最近の予定登録
- 要対応警告

Google認証失効時は再接続案内を表示する。Mapping不整合時は該当登録先の修正導線を表示する。

## 12. 操作履歴
一覧表示:
- title
- start/end
- Logical Destination
- status
- createdAt

詳細表示:
- title
- start/end
- destination
- operation status
- operationId
- createdAt

Google Calendar内部IDや認証情報は表示しない。TimeTree/Yahooについては登録成功を断定せず、Google Calendarへの登録結果のみを表示する。

## 13. アカウント
Schedule Hubログイン用Google IdentityとCalendar接続Google Accountを分離表示する。

```text
ログイン
Google: example@gmail.com

Calendar接続
Google: work@gmail.com
[管理]

[ログアウト]
```
ログアウトとCalendar接続解除は別操作とする。Calendar接続解除時も既存Google Calendar上の予定は削除しない。

## 14. 通常画面遷移
```text
Dashboard
├ Calendar接続
├ 登録先
│  └ 登録先編集
├ 予定設定
├ 外部表示
│  └ 端末設定ガイド
├ Claude接続
├ 履歴
│  └ 履歴詳細
└ アカウント
```

## 15. 初回画面遷移
```text
サインイン
  ↓
セットアップ開始
  ↓
Google Calendar接続
  ↓
接続済みCalendar確認
  ↓
登録先設定
  ↓
予定デフォルト設定
  ↓
外部表示設定（任意）
  ↓
Claude接続
  ↓
セットアップ完了
  ↓
Dashboard
```

途中離脱しても再開可能とする。必要であればPROFILEにonboardingCompleted等のフラグを持たせる。

## 16. 主要API対応
| 画面 | 主API |
|---|---|
| Dashboard | GET /api/v1/me, calendar-connections, destinations, operations |
| Calendar接続 | CalendarConnection一覧、OAuth start、disconnect、sync |
| 接続済みカレンダー | GET /api/v1/physical-calendars |
| 登録先一覧 | GET /api/v1/destinations |
| 登録先編集 | POST/PATCH /api/v1/destinations |
| 予定設定 | GET /api/v1/me, PATCH /api/v1/me/preferences |
| 外部表示 | GET/PUT /api/v1/external-display-targets |
| 履歴 | GET /api/v1/operations |
| 履歴詳細 | GET /api/v1/operations/{operationId} |

## 17. MVPでWebに持たせない機能
予定作成フォームは作成しない。Webの責務は「予定をどう登録するか」を設定することとし、予定作成はClaude経由に限定する。
