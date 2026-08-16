import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import {
  DashboardPage,
  SetupPage,
  deriveSetupState,
  type SetupDashboardApi,
  type SetupSnapshot,
} from "./setup-dashboard.js";

const readySnapshot: SetupSnapshot = {
  connections: [
    {
      connectionId: "conn_1",
      accountIdentifier: "calendar@example.com",
      status: "ACTIVE",
    },
  ],
  calendars: [
    {
      physicalCalendarId: "pcal_1",
      name: "メイン",
      writable: true,
    },
  ],
  destinations: [
    {
      destinationId: "dest_1",
      name: "プライベート",
      physicalCalendarIds: ["pcal_1"],
      enabled: true,
    },
  ],
  recentOperations: [],
};

describe("セットアップ状態判定", () => {
  it("Google接続がなければ接続stepから開始する", () => {
    expect(
      deriveSetupState({
        ...readySnapshot,
        connections: [],
        calendars: [],
        destinations: [],
      }),
    ).toMatchObject({ currentStep: "CONNECT_GOOGLE", completed: false });
  });

  it("接続済みでも有効な書込Mappingがなければ登録先stepから再開する", () => {
    expect(
      deriveSetupState({
        ...readySnapshot,
        destinations: [
          {
            ...readySnapshot.destinations[0],
            physicalCalendarIds: ["missing"],
          },
        ],
      }),
    ).toMatchObject({ currentStep: "CONFIGURE_DESTINATION", completed: false });
  });

  it("Google接続と有効な書込Mappingが揃えばDashboardへ進める", () => {
    expect(deriveSetupState(readySnapshot)).toMatchObject({
      currentStep: "READY",
      completed: true,
    });
  });
});

describe("セットアップWizard", () => {
  it("OAuth callback成功を表示し、次の登録先設定を案内する", async () => {
    renderPage(
      <SetupPage
        api={api({ ...readySnapshot, destinations: [] })}
        oauthResult="success"
      />,
    );

    expect(
      await screen.findByText("Googleカレンダーを接続しました"),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "登録先を設定" })).toBeVisible();
    expect(screen.getByRole("link", { name: "登録先を作成" })).toHaveAttribute(
      "href",
      "/settings/destinations",
    );
  });

  it("OAuth callback失敗を表示して再試行できる", async () => {
    const startOAuth = vi.fn(async () => ({
      authorizationUrl: "https://accounts.google.com/o/oauth2/auth",
    }));
    const openAuthorizationUrl = vi.fn();
    renderPage(
      <SetupPage
        api={api(
          { ...readySnapshot, connections: [], calendars: [] },
          startOAuth,
        )}
        oauthResult="failed"
        openAuthorizationUrl={openAuthorizationUrl}
      />,
    );
    const user = userEvent.setup();

    expect(
      await screen.findByText("Googleカレンダーを接続できませんでした"),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Google Calendarを接続" }),
    );
    expect(startOAuth).toHaveBeenCalledOnce();
    expect(openAuthorizationUrl).toHaveBeenCalledWith(
      "https://accounts.google.com/o/oauth2/auth",
    );
  });

  it("必須条件が揃えばDashboardへの完了導線を表示する", async () => {
    renderPage(<SetupPage api={api(readySnapshot)} />);

    expect(
      await screen.findByRole("heading", { name: "セットアップ完了" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "ダッシュボードへ" }),
    ).toHaveAttribute("href", "/dashboard");
  });
});

describe("Dashboard", () => {
  it("Google認証失効時に再接続導線を表示する", async () => {
    renderPage(
      <DashboardPage
        api={api({
          ...readySnapshot,
          connections: [
            { ...readySnapshot.connections[0], status: "REAUTH_REQUIRED" },
          ],
        })}
      />,
    );

    expect(
      await screen.findByText("Googleアカウントの再接続が必要です"),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "再接続する" })).toHaveAttribute(
      "href",
      "/settings/calendars",
    );
  });

  it("Mapping不整合時に該当登録先の修正導線を表示する", async () => {
    renderPage(
      <DashboardPage
        api={api({
          ...readySnapshot,
          destinations: [
            {
              ...readySnapshot.destinations[0],
              physicalCalendarIds: ["missing"],
            },
          ],
        })}
      />,
    );

    expect(
      await screen.findByText("プライベートの登録先を修正してください"),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "登録先を修正" })).toHaveAttribute(
      "href",
      "/settings/destinations",
    );
  });
});

function api(
  snapshot: SetupSnapshot,
  startOAuth: SetupDashboardApi["startGoogleOAuth"] = async () => ({
    authorizationUrl: "https://accounts.google.com/o/oauth2/auth",
  }),
): SetupDashboardApi {
  return {
    getSnapshot: vi.fn(async () => snapshot),
    startGoogleOAuth: startOAuth,
  };
}

function renderPage(element: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{element}</MemoryRouter>
    </QueryClientProvider>,
  );
}
