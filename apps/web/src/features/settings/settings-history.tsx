import { AlertTriangle, CalendarDays, CheckCircle2, Info } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button.js";

export interface SettingsCalendar {
  readonly physicalCalendarId: string;
  readonly name: string;
  readonly writable: boolean;
}

export interface SettingsDestination {
  readonly destinationId: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly description: string;
  readonly physicalCalendarIds: readonly string[];
  readonly enabled: boolean;
}

export interface ExternalDisplayTarget {
  readonly target: "TIMETREE" | "YAHOO";
  readonly enabled: boolean;
  readonly physicalCalendarId: string | null;
  readonly setupConfirmed: boolean;
}

export interface OperationEvent {
  readonly physicalCalendarId: string;
  readonly status: "SUCCESS" | "FAILED";
  readonly errorCode: string | null;
}

export interface OperationHistoryItem {
  readonly operationId: string;
  readonly title: string;
  readonly start: string;
  readonly end: string;
  readonly status: "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED" | "PROCESSING";
  readonly createdAt: string;
  readonly events: readonly OperationEvent[];
}

export interface SettingsHistoryApi {
  saveDestination(input: {
    readonly name: string;
    readonly aliases: readonly string[];
    readonly description: string;
    readonly physicalCalendarIds: readonly string[];
  }): Promise<void>;
  saveDisplayTarget(
    target: ExternalDisplayTarget["target"],
    input: Omit<ExternalDisplayTarget, "target">,
  ): Promise<void>;
}

export function DestinationSettingsPage({
  api,
  calendars,
  destinations,
}: {
  readonly api: SettingsHistoryApi;
  readonly calendars: readonly SettingsCalendar[];
  readonly destinations: readonly SettingsDestination[];
}) {
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [description, setDescription] = useState("");
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [saved, setSaved] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const validationErrors = [
      ...(name.trim().length === 0 ? ["登録先名を入力してください"] : []),
      ...(selectedIds.length === 0
        ? ["書き込み可能なカレンダーを1つ以上選択してください"]
        : []),
    ];
    setErrors(validationErrors);
    setSaved(false);
    if (validationErrors.length > 0) return;
    await api.saveDestination({
      name: name.trim(),
      aliases: aliases
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
      description: description.trim(),
      physicalCalendarIds: selectedIds,
    });
    setSaved(true);
  };

  return (
    <Page
      title="登録先"
      description="Claudeが予定内容から選ぶ登録先を管理します。"
    >
      {destinations.length > 0 ? (
        <div className="mb-8 grid gap-3">
          {destinations.map((destination) => (
            <article
              key={destination.destinationId}
              className="rounded-2xl border border-stone-200 bg-white p-5"
            >
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-semibold text-stone-950">
                  {destination.name}
                </h2>
                <span className="text-sm text-stone-500">
                  {destination.enabled ? "有効" : "無効"}
                </span>
              </div>
              <p className="mt-2 text-sm text-stone-600">
                {destination.description}
              </p>
            </article>
          ))}
        </div>
      ) : null}

      <form
        className="rounded-3xl border border-stone-200 bg-white p-6 sm:p-8"
        onSubmit={(event) => void submit(event)}
      >
        <h2 className="text-xl font-semibold">新しい登録先</h2>
        <div className="mt-6 grid gap-5">
          <Field label="登録先名">
            <input
              className={inputClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="別名" hint="カンマ区切り（例: 会社, 業務, work）">
            <input
              className={inputClass}
              value={aliases}
              onChange={(event) => setAliases(event.target.value)}
            />
          </Field>
          <Field label="どんな予定に使いますか？">
            <textarea
              className={`${inputClass} min-h-28 resize-y`}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <fieldset>
            <legend className="text-sm font-semibold text-stone-800">
              登録するGoogleカレンダー
            </legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {calendars.map((calendar) => (
                <label
                  key={calendar.physicalCalendarId}
                  className="flex items-center gap-3 rounded-xl border border-stone-200 px-4 py-3 text-sm"
                >
                  <input
                    type="checkbox"
                    disabled={!calendar.writable}
                    checked={selectedIds.includes(calendar.physicalCalendarId)}
                    onChange={(event) =>
                      setSelectedIds((current) =>
                        event.target.checked
                          ? [...current, calendar.physicalCalendarId]
                          : current.filter(
                              (id) => id !== calendar.physicalCalendarId,
                            ),
                      )
                    }
                  />
                  {calendar.name}
                  {!calendar.writable ? "（閲覧専用）" : ""}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        {errors.length > 0 ? (
          <ul className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}
        {saved ? (
          <p className="mt-5 text-sm font-medium text-emerald-700">
            登録先を保存しました
          </p>
        ) : null}
        <Button className="mt-6" type="submit">
          登録先を保存
        </Button>
      </form>
    </Page>
  );
}

export function CalendarSettingsPage({
  calendars,
}: {
  readonly calendars: readonly SettingsCalendar[];
}) {
  return (
    <Page
      title="接続済みカレンダー"
      description="Googleアカウントから検出したカレンダーです。"
    >
      <div className="grid gap-3">
        {calendars.map((calendar) => (
          <article
            key={calendar.physicalCalendarId}
            className="flex items-center gap-4 rounded-2xl border border-stone-200 bg-white p-5"
          >
            <CalendarDays aria-hidden="true" className="size-5 text-teal-700" />
            <div className="flex-1">
              <h2 className="font-semibold">{calendar.name}</h2>
              <p className="mt-1 text-sm text-stone-500">
                {calendar.writable
                  ? "予定を書き込めます"
                  : "閲覧専用・登録先には選択できません"}
              </p>
            </div>
          </article>
        ))}
      </div>
    </Page>
  );
}

export function ExternalDisplaySettingsPage({
  api,
  calendars,
  targets,
}: {
  readonly api: SettingsHistoryApi;
  readonly calendars: readonly SettingsCalendar[];
  readonly targets: readonly ExternalDisplayTarget[];
}) {
  void api;
  void calendars;
  return (
    <Page
      title="外部カレンダー表示"
      description="Googleカレンダーを端末側でTimeTreeやYahooに表示するための確認設定です。"
    >
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
        <div className="flex gap-3">
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0"
          />
          <div>
            <p className="font-semibold">
              TimeTreeやYahooへ予定を直接登録する機能ではありません。
            </p>
            <p className="mt-1">
              端末側の同期状態によって表示されない場合があります。TimeTree共有カレンダーへの自動登録には対応していません。
            </p>
          </div>
        </div>
      </div>
      <div className="mt-6 grid gap-3">
        {(["TIMETREE", "YAHOO"] as const).map((target) => {
          const current = targets.find((item) => item.target === target);
          return (
            <article
              key={target}
              className="rounded-2xl border border-stone-200 bg-white p-5"
            >
              <h2 className="font-semibold">
                {target === "TIMETREE" ? "TimeTree" : "Yahoo!カレンダー"}
              </h2>
              <p className="mt-2 text-sm text-stone-500">
                {current?.setupConfirmed
                  ? "端末設定済み"
                  : "端末設定を確認してください"}
              </p>
            </article>
          );
        })}
      </div>
    </Page>
  );
}

export function OperationHistoryPage({
  operations,
}: {
  readonly operations: readonly OperationHistoryItem[];
}) {
  return (
    <Page
      title="操作履歴"
      description="Claudeから依頼した予定のGoogle Calendar登録結果です。"
    >
      <div className="mb-5 flex gap-3 rounded-2xl bg-stone-100 p-4 text-sm text-stone-600">
        <Info aria-hidden="true" className="size-5 shrink-0" />
        <p>操作ログは30日間保持され、その後自動的に削除されます。</p>
      </div>
      <div className="grid gap-3">
        {operations.map((operation) => {
          const successes = operation.events.filter(
            ({ status }) => status === "SUCCESS",
          ).length;
          const failures = operation.events.filter(
            ({ status }) => status === "FAILED",
          ).length;
          return (
            <article
              key={operation.operationId}
              className="rounded-2xl border border-stone-200 bg-white p-5"
            >
              <div className="flex flex-col justify-between gap-3 sm:flex-row">
                <div>
                  <h2 className="font-semibold text-stone-950">
                    {operation.title}
                  </h2>
                  <p className="mt-1 text-sm text-stone-500">
                    {operation.start} — {operation.end}
                  </p>
                </div>
                <StatusBadge status={operation.status} />
              </div>
              <p className="mt-4 text-sm text-stone-600">
                Google Calendar: 成功 {successes}件 / 失敗 {failures}件
              </p>
            </article>
          );
        })}
      </div>
    </Page>
  );
}

function StatusBadge({
  status,
}: {
  readonly status: OperationHistoryItem["status"];
}) {
  const label = {
    SUCCESS: "成功",
    PARTIAL_SUCCESS: "一部成功",
    FAILED: "失敗",
    PROCESSING: "処理中",
  }[status];
  return (
    <span className="inline-flex h-8 items-center gap-2 self-start rounded-full bg-stone-100 px-3 text-sm font-medium">
      {status === "SUCCESS" ? (
        <CheckCircle2 aria-hidden="true" className="size-4 text-emerald-700" />
      ) : null}
      {label}
    </span>
  );
}

function Page({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section>
      <p className="text-sm font-semibold text-teal-700">設定</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-950 sm:text-4xl">
        {title}
      </h1>
      <p className="mt-3 text-stone-600">{description}</p>
      <div className="mt-8">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-stone-800">
      <span>{label}</span>
      {children}
      {hint === undefined ? null : (
        <span className="font-normal text-stone-500">{hint}</span>
      )}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 font-normal outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100";
