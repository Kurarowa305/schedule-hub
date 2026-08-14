# 1つのAWS環境で縦切りTDDを行う

Status: accepted（採用）

実装は、合意した公開境界（Domain/Application Port、API Handler、MCP Tool契約、選択したAWS統合境界）でRed → Green → Refactorを繰り返す。CDKは1つのmain環境を管理し、CIではGoogle APIをモックする。リリース前の手動確認には専用のGoogleテストアカウントとテストCalendarを使う。

## 影響

- テストは非公開の協調相手ではなく、公開インターフェースを通じて振る舞いを検証する。
- テストユーザーは通常ユーザーと同じDomain、DynamoDB、OAuth、保持ルールに従う。
- OAuthStateはTTLで管理し、CreateOperationとExternalEventの履歴は保持する。
