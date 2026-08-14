# MCP境界ではLogical Destinationを扱う

Status: accepted（採用）

ClaudeとMCP Toolが公開するのはLogical Destination IDだけとする。Schedule Hubが内部でPhysical Calendarへ解決するため、Provider側カレンダーID、アカウント識別子、OAuth認証情報はMCP境界を越えない。この構成により、ユーザー向けモデルを保ったままProvider Adapterを拡張できる。

## 影響

- `create_schedule` サーバー側で登録先の所有者と有効状態を検証する.
- 複数のLogical Destinationが同じPhysical Calendarへ解決された場合、Provider呼び出し前に重複排除する。
 - DynamoDBのMVPモデルではLogicalDestinationにphysicalCalendarIdsを保持し、独立したMapping Entityは作成しない。
