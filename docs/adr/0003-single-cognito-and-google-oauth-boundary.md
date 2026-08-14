# Schedule Hub認証とGoogle Calendar認可を分離する

Status: accepted（採用）

Schedule HubはWebとMCPの識別にGoogle Federation付きCognitoを使い、Calendarアクセスには別の直接Google OAuthフローを使う。WebとMCPはCognito App Clientを分離するが、同じUser PoolとCognito subを使う。CalendarのRefresh TokenはAWS内部に留め、ユーザーのCalendar Connectionに保存する。

## 影響

 - ログアウトしてもGoogle Calendar接続は解除しない。
 - 接続失効時はREAUTH_REQUIREDとし、既存Mappingと履歴は保持する。
 - Refresh TokenはREST/MCP APIから返さず、ログにも出力しない。
