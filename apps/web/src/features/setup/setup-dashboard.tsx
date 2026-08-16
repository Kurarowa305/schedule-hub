import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  Check,
  Link2,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button.js";

export interface SetupConnection {
  readonly connectionId: string;
  readonly accountIdentifier: string;
  readonly status: "ACTIVE" | "REAUTH_REQUIRED";
}

export interface SetupCalendar {
  readonly physicalCalendarId: string;
  readonly name: string;
  readonly writable: boolean;
}

export interface SetupDestination {
  readonly destinationId: string;
  readonly name: string;
  readonly physicalCalendarIds: readonly string[];
  readonly enabled: boolean;
}

export interface RecentOperation {
  readonly operationId: string;
  readonly title: string;
  readonly status: "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED" | "PROCESSING";
  readonly createdAt: string;
}

export interface SetupSnapshot {
  readonly connections: readonly SetupConnection[];
  readonly calendars: readonly SetupCalendar[];
  readonly destinations: readonly SetupDestination[];
  readonly recentOperations: readonly RecentOperation[];
}

export interface SetupDashboardApi {
  getSnapshot(): Promise<SetupSnapshot>;
  startGoogleOAuth(): Promise<{ readonly authorizationUrl: string }>;
}

export type SetupStep = "CONNECT_GOOGLE" | "CONFIGURE_DESTINATION" | "READY";

export interface SetupState {
  readonly currentStep: SetupStep;
  readonly completed: boolean;
  readonly activeConnections: readonly SetupConnection[];
  readonly writableCalendars: readonly SetupCalendar[];
  readonly validDestinations: readonly SetupDestination[];
  readonly brokenDestinations: readonly SetupDestination[];
  readonly reauthConnections: readonly SetupConnection[];
}

export function deriveSetupState(snapshot: SetupSnapshot): SetupState {
  const activeConnections = snapshot.connections.filter(
    ({ status }) => status === "ACTIVE",
  );
  const reauthConnections = snapshot.connections.filter(
    ({ status }) => status === "REAUTH_REQUIRED",
  );
  const writableCalendars = snapshot.calendars.filter(
    ({ writable }) => writable,
  );
  const writableIds = new Set(
    writableCalendars.map(({ physicalCalendarId }) => physicalCalendarId),
  );
  const enabledDestinations = snapshot.destinations.filter(
    ({ enabled }) => enabled,
  );
  const validDestinations = enabledDestinations.filter(
    ({ physicalCalendarIds }) =>
      physicalCalendarIds.some((id) => writableIds.has(id)),
  );
  const brokenDestinations = enabledDestinations.filter(
    ({ physicalCalendarIds }) =>
      !physicalCalendarIds.some((id) => writableIds.has(id)),
  );
  const currentStep: SetupStep =
    activeConnections.length === 0
      ? "CONNECT_GOOGLE"
      : validDestinations.length === 0
        ? "CONFIGURE_DESTINATION"
        : "READY";

  return {
    currentStep,
    completed: currentStep === "READY",
    activeConnections,
    writableCalendars,
    validDestinations,
    brokenDestinations,
    reauthConnections,
  };
}

export function SetupPage({
  api,
  oauthResult,
  openAuthorizationUrl = (url) => window.location.assign(url),
}: {
  readonly api: SetupDashboardApi;
  readonly oauthResult?: "success" | "failed";
  readonly openAuthorizationUrl?: (url: string) => void;
}) {
  const snapshot = useSetupSnapshot(api);
  const [startingOAuth, setStartingOAuth] = useState(false);
  const [oauthStartFailed, setOauthStartFailed] = useState(false);

  if (snapshot.isPending) return <LoadingState />;
  if (snapshot.isError)
    return <LoadError onRetry={() => void snapshot.refetch()} />;

  const state = deriveSetupState(snapshot.data);
  const startOAuth = async () => {
    setStartingOAuth(true);
    setOauthStartFailed(false);
    try {
      const { authorizationUrl } = await api.startGoogleOAuth();
      openAuthorizationUrl(authorizationUrl);
    } catch {
      setOauthStartFailed(true);
      setStartingOAuth(false);
    }
  };

  return (
    <section className="mx-auto max-w-4xl">
      <p className="text-sm font-semibold text-teal-700">初回セットアップ</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-950 sm:text-4xl">
        Claudeから予定を登録する準備
      </h1>
      <p className="mt-4 max-w-2xl leading-7 text-stone-600">
        Googleカレンダーを接続し、予定の内容に合わせた登録先を1つ作成します。
      </p>

      {oauthResult === "success" ? (
        <Notice tone="success">Googleカレンダーを接続しました</Notice>
      ) : null}
      {oauthResult === "failed" || oauthStartFailed ? (
        <Notice tone="warning">Googleカレンダーを接続できませんでした</Notice>
      ) : null}

      <ol className="mt-8 grid gap-3 sm:grid-cols-3">
        <StepItem
          number={1}
          label="Google接続"
          complete={state.activeConnections.length > 0}
          current={state.currentStep === "CONNECT_GOOGLE"}
        />
        <StepItem
          number={2}
          label="登録先設定"
          complete={state.validDestinations.length > 0}
          current={state.currentStep === "CONFIGURE_DESTINATION"}
        />
        <StepItem
          number={3}
          label="利用開始"
          complete={state.completed}
          current={state.currentStep === "READY"}
        />
      </ol>

      <div className="mt-8 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        {state.currentStep === "CONNECT_GOOGLE" ? (
          <SetupAction
            icon={<Link2 aria-hidden="true" />}
            title="Googleアカウントのカレンダーを接続"
            description="予定を書き込むGoogleカレンダーをSchedule Hubに接続します。Google Calendarアプリのインストールは不要です。"
          >
            <Button onClick={() => void startOAuth()} disabled={startingOAuth}>
              {startingOAuth ? <LoaderCircle className="animate-spin" /> : null}
              Google Calendarを接続
            </Button>
          </SetupAction>
        ) : null}
        {state.currentStep === "CONFIGURE_DESTINATION" ? (
          <SetupAction
            icon={<CalendarCheck aria-hidden="true" />}
            title="登録先を設定"
            description="「仕事」「プライベート」など、Claudeが予定内容から選べる登録先を作成します。"
          >
            <Button asChild>
              <Link to="/settings/destinations">
                登録先を作成
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </SetupAction>
        ) : null}
        {state.currentStep === "READY" ? (
          <SetupAction
            icon={<Check aria-hidden="true" />}
            title="セットアップ完了"
            description="Claudeとの接続ガイドを確認すれば、チャットから予定を登録できます。"
          >
            <Button asChild>
              <Link to="/dashboard">
                ダッシュボードへ
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </SetupAction>
        ) : null}
      </div>
    </section>
  );
}

export function DashboardPage({ api }: { readonly api: SetupDashboardApi }) {
  const snapshot = useSetupSnapshot(api);
  if (snapshot.isPending) return <LoadingState />;
  if (snapshot.isError)
    return <LoadError onRetry={() => void snapshot.refetch()} />;

  const state = deriveSetupState(snapshot.data);
  return (
    <section>
      <p className="text-sm font-semibold text-teal-700">Schedule Hub</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-950 sm:text-4xl">
        ダッシュボード
      </h1>
      <p className="mt-3 text-stone-600">
        Claudeから予定を登録できる状態を確認できます。
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <StatusCard
          label="Google接続"
          value={`${state.activeConnections.length}件`}
        />
        <StatusCard
          label="利用できる登録先"
          value={`${state.validDestinations.length}件`}
        />
        <StatusCard
          label="セットアップ"
          value={state.completed ? "完了" : "要設定"}
        />
      </div>

      <div className="mt-8 space-y-3">
        {state.reauthConnections.map((connection) => (
          <WarningCard
            key={connection.connectionId}
            message="Googleアカウントの再接続が必要です"
            detail={connection.accountIdentifier}
            linkLabel="再接続する"
            to="/settings/calendars"
          />
        ))}
        {state.brokenDestinations.map((destination) => (
          <WarningCard
            key={destination.destinationId}
            message={`${destination.name}の登録先を修正してください`}
            detail="書き込み可能なGoogleカレンダーが割り当てられていません。"
            linkLabel="登録先を修正"
            to="/settings/destinations"
          />
        ))}
      </div>

      <div className="mt-8 rounded-3xl bg-teal-950 p-6 text-white sm:p-8">
        <p className="text-sm font-semibold text-teal-200">Claude Connector</p>
        <h2 className="mt-2 text-2xl font-semibold">
          Claudeとの接続方法を確認
        </h2>
        <p className="mt-3 max-w-xl leading-7 text-teal-50/80">
          Connectorを追加すると、普段のチャットからSchedule
          Hubへ予定を登録できます。
        </p>
        <Button
          asChild
          className="mt-6 bg-white text-teal-950 hover:bg-teal-50"
        >
          <Link to="/settings/claude">接続ガイドを見る</Link>
        </Button>
      </div>
    </section>
  );
}

function useSetupSnapshot(api: SetupDashboardApi) {
  return useQuery({
    queryKey: ["setup-dashboard"],
    queryFn: () => api.getSnapshot(),
  });
}

function StepItem({
  number,
  label,
  complete,
  current,
}: {
  readonly number: number;
  readonly label: string;
  readonly complete: boolean;
  readonly current: boolean;
}) {
  return (
    <li
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${
        current ? "border-teal-300 bg-teal-50" : "border-stone-200 bg-white"
      }`}
    >
      <span
        className={`grid size-8 place-items-center rounded-full text-sm font-semibold ${
          complete ? "bg-teal-700 text-white" : "bg-stone-100 text-stone-500"
        }`}
      >
        {complete ? <Check aria-hidden="true" className="size-4" /> : number}
      </span>
      <span className="text-sm font-medium">{label}</span>
    </li>
  );
}

function SetupAction({
  icon,
  title,
  description,
  children,
}: {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly description: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-6 sm:flex-row">
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-teal-100 text-teal-800 [&_svg]:size-6">
        {icon}
      </span>
      <div className="flex-1">
        <h2 className="text-xl font-semibold text-stone-950">{title}</h2>
        <p className="mt-2 max-w-xl leading-7 text-stone-600">{description}</p>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

function StatusCard({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-stone-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-stone-950">{value}</p>
    </div>
  );
}

function WarningCard({
  message,
  detail,
  linkLabel,
  to,
}: {
  readonly message: string;
  readonly detail: string;
  readonly linkLabel: string;
  readonly to: string;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:flex-row sm:items-center">
      <AlertTriangle
        aria-hidden="true"
        className="size-5 shrink-0 text-amber-700"
      />
      <div className="flex-1">
        <p className="font-semibold text-amber-950">{message}</p>
        <p className="mt-1 text-sm text-amber-800">{detail}</p>
      </div>
      <Link className="text-sm font-semibold text-amber-950 underline" to={to}>
        {linkLabel}
      </Link>
    </div>
  );
}

function Notice({
  tone,
  children,
}: {
  readonly tone: "success" | "warning";
  readonly children: React.ReactNode;
}) {
  return (
    <p
      role="status"
      className={`mt-6 rounded-2xl px-4 py-3 text-sm font-medium ${
        tone === "success"
          ? "bg-emerald-50 text-emerald-800"
          : "bg-amber-50 text-amber-900"
      }`}
    >
      {children}
    </p>
  );
}

function LoadingState() {
  return (
    <div
      className="flex min-h-64 items-center justify-center gap-3 text-stone-500"
      role="status"
    >
      <LoaderCircle aria-hidden="true" className="animate-spin" />
      設定を読み込んでいます
    </div>
  );
}

function LoadError({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
      <p className="font-semibold text-red-900">設定を読み込めませんでした</p>
      <Button variant="ghost" className="mt-3" onClick={onRetry}>
        <RefreshCw aria-hidden="true" />
        再読み込み
      </Button>
    </div>
  );
}
