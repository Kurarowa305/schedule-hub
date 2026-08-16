import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  CalendarDays,
  History,
  LayoutDashboard,
  LogOut,
  Settings2,
} from "lucide-react";
import {
  BrowserRouter,
  Link,
  MemoryRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
} from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "../components/ui/button.js";

export interface AuthSession {
  readonly userId: string;
  readonly accessToken: string;
  readonly expiresAt: number;
}

export interface AuthSessionStore {
  load(): Promise<AuthSession | null>;
  clear(): Promise<void>;
}
export interface AppPageElements {
  readonly calendars: ReactNode;
  readonly destinations: ReactNode;
  readonly preferences: ReactNode;
  readonly externalDisplay: ReactNode;
  readonly operations: ReactNode;
}

export interface AppProps {
  readonly authSessionStore?: AuthSessionStore;
  readonly initialPath?: string;
  readonly now?: () => number;
  readonly dashboard?: ReactNode;
  readonly setup?: ReactNode;
  readonly pages?: AppPageElements;
}

type AuthState =
  | { readonly status: "loading" }
  | { readonly status: "anonymous" }
  | { readonly status: "authenticated"; readonly session: AuthSession };

const navigation = [
  { to: "/dashboard", label: "ダッシュボード", icon: LayoutDashboard },
  { to: "/settings/calendars", label: "カレンダー", icon: CalendarDays },
  { to: "/settings/destinations", label: "登録先", icon: Settings2 },
  { to: "/operations", label: "操作履歴", icon: History },
] as const;

export function App({
  authSessionStore = browserAuthSessionStore,
  initialPath,
  now = Date.now,
  dashboard,
  setup,
  pages,
}: AppProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
        },
      }),
  );
  const Router = initialPath === undefined ? BrowserRouter : MemoryRouter;
  const routerProps =
    initialPath === undefined ? {} : { initialEntries: [initialPath] };

  return (
    <QueryClientProvider client={queryClient}>
      <Router {...routerProps}>
        <AuthRoutes
          authSessionStore={authSessionStore}
          now={now}
          dashboard={dashboard}
          setup={setup}
          pages={pages}
        />
      </Router>
    </QueryClientProvider>
  );
}

function AuthRoutes({
  authSessionStore,
  now,
  dashboard,
  setup,
  pages,
}: {
  readonly authSessionStore: AuthSessionStore;
  readonly now: () => number;
  readonly setup?: ReactNode;
  readonly dashboard?: ReactNode;
  readonly pages?: AppPageElements;
}) {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    void authSessionStore.load().then(async (session) => {
      if (!active) return;
      if (session === null || session.expiresAt <= now()) {
        if (session !== null) await authSessionStore.clear();
        if (active) setAuth({ status: "anonymous" });
        return;
      }
      setAuth({ status: "authenticated", session });
    });
    return () => {
      active = false;
    };
  }, [authSessionStore, now]);

  if (auth.status === "loading") {
    return (
      <main className="grid min-h-screen place-items-center bg-stone-50 text-stone-600">
        <p role="status">Schedule Hubを読み込んでいます</p>
      </main>
    );
  }

  return (
    <Routes>
      <Route
        path="/signin"
        element={
          auth.status === "authenticated" ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <SignInPage />
          )
        }
      />
      <Route
        element={
          auth.status === "authenticated" ? (
            <AppLayout
              onSignOut={() => {
                void authSessionStore
                  .clear()
                  .then(() => setAuth({ status: "anonymous" }));
              }}
            />
          ) : (
            <Navigate to="/signin" replace />
          )
        }
      >
        <Route
          path="/setup"
          element={setup ?? <PlaceholderPage title="初回セットアップ" />}
        />
        <Route
          path="/dashboard"
          element={dashboard ?? <PlaceholderPage title="ダッシュボード" />}
        />
        <Route
          path="/settings/calendars"
          element={
            pages?.calendars ?? <PlaceholderPage title="接続済みカレンダー" />
          }
        />
        <Route
          path="/settings/destinations"
          element={pages?.destinations ?? <PlaceholderPage title="登録先" />}
        />
        <Route
          path="/settings/preferences"
          element={pages?.preferences ?? <PlaceholderPage title="予定設定" />}
        />
        <Route
          path="/settings/external-display"
          element={
            pages?.externalDisplay ?? (
              <PlaceholderPage title="外部カレンダー表示" />
            )
          }
        />
        <Route
          path="/settings/claude"
          element={<PlaceholderPage title="Claude接続" />}
        />
        <Route
          path="/operations"
          element={pages?.operations ?? <PlaceholderPage title="操作履歴" />}
        />
        <Route
          path="/account"
          element={<PlaceholderPage title="アカウント" />}
        />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function AppLayout({ onSignOut }: { readonly onSignOut: () => void }) {
  return (
    <div className="min-h-screen bg-[var(--surface)] text-stone-900">
      <aside
        data-testid="desktop-navigation"
        className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-stone-200 bg-white px-5 py-6 lg:flex"
      >
        <Brand />
        <Navigation ariaLabel="メインナビゲーション" className="mt-10" />
        <Button
          variant="ghost"
          className="mt-auto justify-start"
          onClick={onSignOut}
        >
          <LogOut aria-hidden="true" />
          サインアウト
        </Button>
      </aside>
      <header className="flex h-16 items-center justify-between border-b border-stone-200 bg-white px-5 lg:hidden">
        <Brand />
        <Link className="text-sm font-medium text-teal-800" to="/account">
          アカウント
        </Link>
      </header>
      <main className="mx-auto min-h-screen max-w-6xl px-5 py-8 pb-28 lg:ml-64 lg:px-10 lg:py-12">
        <Outlet />
      </main>
      <Navigation
        ariaLabel="モバイルナビゲーション"
        dataTestId="mobile-navigation"
        className="fixed inset-x-0 bottom-0 z-20 flex h-20 items-center justify-around border-t border-stone-200 bg-white/95 px-2 backdrop-blur lg:hidden"
      />
    </div>
  );
}

function Navigation({
  ariaLabel,
  className,
  dataTestId,
}: {
  readonly ariaLabel: string;
  readonly className: string;
  readonly dataTestId?: string;
}) {
  return (
    <nav aria-label={ariaLabel} className={className} data-testid={dataTestId}>
      {navigation.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-stone-600 transition hover:bg-teal-50 hover:text-teal-900"
        >
          <Icon aria-hidden="true" className="size-5" />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <Link
      className="flex items-center gap-3"
      to="/dashboard"
      aria-label="Schedule Hub"
    >
      <span className="grid size-9 place-items-center rounded-xl bg-teal-700 text-white shadow-sm">
        <CalendarDays aria-hidden="true" className="size-5" />
      </span>
      <span className="font-semibold tracking-tight">Schedule Hub</span>
    </Link>
  );
}

function SignInPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--surface)] px-5">
      <section className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-8 shadow-[0_24px_80px_-36px_rgba(15,118,110,0.35)]">
        <Brand />
        <p className="mt-10 text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">
          Calendar settings for Claude
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
          Schedule Hubへサインイン
        </h1>
        <p className="mt-4 leading-7 text-stone-600">
          Googleカレンダーの登録先を整えて、予定作成はClaudeに任せましょう。
        </p>
        <Button className="mt-8 w-full">Googleで続ける</Button>
      </section>
    </main>
  );
}

function PlaceholderPage({
  title,
  children,
}: {
  readonly title: string;
  readonly children?: ReactNode;
}) {
  return (
    <section>
      <p className="text-sm font-semibold text-teal-700">Schedule Hub</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-950 sm:text-4xl">
        {title}
      </h1>
      <div className="mt-8">{children}</div>
    </section>
  );
}

const browserAuthSessionStore: AuthSessionStore = {
  async load() {
    const value = window.localStorage.getItem("schedule-hub.auth-session");
    if (value === null) return null;
    try {
      return JSON.parse(value) as AuthSession;
    } catch {
      window.localStorage.removeItem("schedule-hub.auth-session");
      return null;
    }
  },
  async clear() {
    window.localStorage.removeItem("schedule-hub.auth-session");
  },
};
