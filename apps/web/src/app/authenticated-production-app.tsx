import { createBrowserSettingsApi } from "../api/settings-history-api.js";
import { createBrowserSetupDashboardApi } from "../api/setup-dashboard-api.js";
import { createCognitoPkceAuth } from "../auth/cognito-pkce.js";
import { SettingsRoutePage } from "../features/settings/settings-route-page.js";
import { DashboardPage, SetupPage } from "../features/setup/setup-dashboard.js";
import { App, type AuthSession, type AuthSessionStore } from "./app.js";

const setupApi = createBrowserSetupDashboardApi();
const settingsApi = createBrowserSettingsApi();
const sessionKey = "schedule-hub.auth-session";
const auth = createCognitoPkceAuth({
  domain: import.meta.env.VITE_COGNITO_DOMAIN,
  clientId: import.meta.env.VITE_COGNITO_WEB_CLIENT_ID,
  redirectUri: `${window.location.origin}/auth/callback`,
});

const authSessionStore: AuthSessionStore = {
  async load() {
    if (window.location.pathname === "/auth/callback") {
      try {
        const session = await auth.handleCallback(
          new URL(window.location.href),
        );
        window.history.replaceState(null, "", "/dashboard");
        return session;
      } catch {
        localStorage.removeItem(sessionKey);
        window.history.replaceState(null, "", "/signin?auth=failed");
        return null;
      }
    }
    return loadStoredSession();
  },
  async clear() {
    localStorage.removeItem(sessionKey);
  },
};

export function AuthenticatedProductionApp() {
  const oauth = new URLSearchParams(window.location.search).get("oauth");
  const oauthResult =
    oauth === "success" || oauth === "failed" ? oauth : undefined;
  return (
    <App
      authSessionStore={authSessionStore}
      onSignIn={async () => {
        window.location.assign((await auth.createSignInUrl()).toString());
      }}
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

function loadStoredSession(): AuthSession | null {
  const value = localStorage.getItem(sessionKey);
  if (value === null) return null;
  try {
    return JSON.parse(value) as AuthSession;
  } catch {
    localStorage.removeItem(sessionKey);
    return null;
  }
}
