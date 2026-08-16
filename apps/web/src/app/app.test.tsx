import "@testing-library/jest-dom/vitest";
import { useQuery } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App, type AuthSessionStore } from "./app.js";

const activeSession = {
  userId: "user-1",
  accessToken: "access-token",
  expiresAt: Date.parse("2026-08-17T12:00:00.000Z"),
};

describe("Schedule Hub SPA基盤", () => {
  it("未認証で保護ルートへ来たらサインイン画面へ遷移する", async () => {
    renderApp({ session: null, initialPath: "/dashboard" });

    expect(
      await screen.findByRole("heading", { name: "Schedule Hubへサインイン" }),
    ).toBeVisible();
    expect(screen.queryByText("ダッシュボード")).not.toBeInTheDocument();
  });

  it("認証済みならDashboardを共通layout内に表示する", async () => {
    renderApp({ session: activeSession, initialPath: "/dashboard" });

    expect(
      await screen.findByRole("heading", { name: "ダッシュボード" }),
    ).toBeVisible();
    expect(
      screen.getByRole("navigation", { name: "メインナビゲーション" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /予定を作成/ }),
    ).not.toBeInTheDocument();
  });

  it("期限切れセッションを破棄してサインインへ遷移する", async () => {
    const clear = vi.fn<AuthSessionStore["clear"]>(async () => undefined);
    renderApp({
      session: {
        ...activeSession,
        expiresAt: Date.parse("2026-08-16T00:00:00.000Z"),
      },
      initialPath: "/settings/calendars",
      clear,
    });

    expect(
      await screen.findByRole("heading", { name: "Schedule Hubへサインイン" }),
    ).toBeVisible();
    await waitFor(() => expect(clear).toHaveBeenCalledOnce());
  });

  it("PC sidebarとモバイルnavigationをレスポンシブclassで切り替える", async () => {
    renderApp({ session: activeSession, initialPath: "/dashboard" });

    expect(await screen.findByTestId("desktop-navigation")).toHaveClass(
      "hidden",
      "lg:flex",
    );
    expect(screen.getByTestId("mobile-navigation")).toHaveClass(
      "flex",
      "lg:hidden",
    );
  });

  it("全ルートへTanStack Query clientを提供する", async () => {
    function QueryConsumer() {
      const query = useQuery({
        queryKey: ["foundation"],
        queryFn: async () => "利用可能",
      });
      return <p>{query.data ?? "読込中"}</p>;
    }

    renderApp({
      session: activeSession,
      initialPath: "/dashboard",
      dashboard: <QueryConsumer />,
    });

    expect(await screen.findByText("利用可能")).toBeVisible();
  });

  it.each([
    ["/setup", "初回セットアップ"],
    ["/settings/calendars", "接続済みカレンダー"],
    ["/settings/destinations", "登録先"],
    ["/settings/preferences", "予定設定"],
    ["/settings/external-display", "外部カレンダー表示"],
    ["/settings/claude", "Claude接続"],
    ["/operations", "操作履歴"],
    ["/account", "アカウント"],
  ])("%sの保護ルートを用意する", async (path, heading) => {
    renderApp({ session: activeSession, initialPath: path });

    expect(await screen.findByRole("heading", { name: heading })).toBeVisible();
  });
});

function renderApp(options: {
  readonly session: typeof activeSession | null;
  readonly initialPath: string;
  readonly clear?: AuthSessionStore["clear"];
  readonly dashboard?: React.ReactNode;
}) {
  const store: AuthSessionStore = {
    load: vi.fn(async () => options.session),
    clear: options.clear ?? vi.fn(async () => undefined),
  };
  return render(
    <App
      authSessionStore={store}
      initialPath={options.initialPath}
      now={() => Date.parse("2026-08-16T06:00:00.000Z")}
      dashboard={options.dashboard}
    />,
  );
}
