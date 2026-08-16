import { createBrowserSetupDashboardApi } from "../api/setup-dashboard-api.js";
import { DashboardPage, SetupPage } from "../features/setup/setup-dashboard.js";
import { App } from "./app.js";

const api = createBrowserSetupDashboardApi();

export function ProductionApp() {
  const oauth = new URLSearchParams(window.location.search).get("oauth");
  const oauthResult =
    oauth === "success" || oauth === "failed" ? oauth : undefined;
  return (
    <App
      dashboard={<DashboardPage api={api} />}
      setup={<SetupPage api={api} oauthResult={oauthResult} />}
    />
  );
}
