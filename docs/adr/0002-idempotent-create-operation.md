# 予定作成をOperation単位で冪等にする

Status: accepted（採用）

Claudeの各予定作成意図は、Claudeが生成したULIDのoperationIdを持つ。Schedule Hubは条件付きでCreateOperationを保存し、hash(userId + operationId + physicalCalendarId)をProviderイベントの決定的識別子として使い、Calendar単位のExternalEvent結果を記録する。再試行では同じOperationを再利用し、成功結果のないCalendarだけを再試行する。

## 影響

- 同じPayloadで再送されたOperationは、既存結果を返す。
- 異なるoperationIdを異なるPayloadで再利用した場合はOPERATION_ID_CONFLICTを返す。
- PROCESSINGのまま停滞したOperationは、DynamoDBのLeaseと条件付き更新で復旧する。
- 部分成功はPhysical Calendar単位で表現し、Logical Destination単位で集約する。
