import { createBrowserSettingsApi } from "../api/settings-history-api.js";
import { createBrowserSetupDashboardApi } from "../api/setup-dashboard-api.js";
import { SettingsRoutePage } from "../features/settings/settings-route-page.js";
import { DashboardPage, SetupPage } from "../features/setup/setup-dashboard.js";
import { App } from "./app.js";

const setupApi = createBrowserSetupDashboardApi();
const settingsApi = createBrowserSettingsApi();

export function ProductionAppWithSettings() {
  const oauth = new URLSearchParams(window.location.search).get("oauth");
  const oauthResult =
    oauth === "success" || oauth === "failed" ? oauth : undefined;
  return (
    <App
      dashboard={<DashboardPage api={setupApi} />}
      setup={<SetupPage api={setupApi} oauthResult={oauthResult} />}
      pages={{
        calendars: <SettingsRoutePage api={settingsApi} section="calendars" />,
        destinations: (
          <SettingsRoutePage api={settingsApi} section="destinations" />
        ),
        preferences: (
          <SettingsRoutePage api={settingsApi} section="preferences" />
        ),
        externalDisplay: (
          <SettingsRoutePage api={settingsApi} section="external-display" />
        ),
        operations: (
          <SettingsRoutePage api={settingsApi} section="operations" />
        ),
      }}
    />
  );
}
