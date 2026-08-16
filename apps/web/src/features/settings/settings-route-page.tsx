import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import type { BrowserSettingsApi } from "../../api/settings-history-api.js";
import { Button } from "../../components/ui/button.js";
import {
  CalendarSettingsPage,
  DestinationSettingsPage,
  ExternalDisplaySettingsPage,
  OperationHistoryPage,
} from "./settings-history.js";

export type SettingsSection =
  | "calendars"
  | "destinations"
  | "preferences"
  | "external-display"
  | "operations";

export function SettingsRoutePage({
  api,
  section,
}: {
  readonly api: BrowserSettingsApi;
  readonly section: SettingsSection;
}) {
  const snapshot = useQuery({
    queryKey: ["settings-history"],
    queryFn: () => api.load(),
  });
  if (snapshot.isPending) return <p role="status">設定を読み込んでいます</p>;
  if (snapshot.isError)
    return <p className="text-red-800">設定を読み込めませんでした</p>;

  switch (section) {
    case "calendars":
      return <CalendarSettingsPage calendars={snapshot.data.calendars} />;
    case "destinations":
      return (
        <DestinationSettingsPage
          api={api}
          calendars={snapshot.data.calendars}
          destinations={snapshot.data.destinations}
        />
      );
    case "preferences":
      return (
        <PreferenceSettingsPage
          api={api}
          initial={snapshot.data.preferences}
          destinations={snapshot.data.destinations}
        />
      );
    case "external-display":
      return (
        <ExternalDisplaySettingsPage
          api={api}
          calendars={snapshot.data.calendars}
          targets={snapshot.data.targets}
        />
      );
    case "operations":
      return <OperationHistoryPage operations={snapshot.data.operations} />;
  }
}

function PreferenceSettingsPage({
  api,
  initial,
  destinations,
}: {
  readonly api: BrowserSettingsApi;
  readonly initial: Awaited<
    ReturnType<BrowserSettingsApi["load"]>
  >["preferences"];
  readonly destinations: Awaited<
    ReturnType<BrowserSettingsApi["load"]>
  >["destinations"];
}) {
  const [timezone, setTimezone] = useState(initial.timezone);
  const [duration, setDuration] = useState(
    String(initial.defaultDurationMinutes),
  );
  const [defaultIds, setDefaultIds] = useState(initial.defaultDestinationIds);
  const [message, setMessage] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = Number(duration);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1440) {
      setMessage("所要時間は1〜1440分で入力してください");
      return;
    }
    try {
      new Intl.DateTimeFormat("ja-JP", { timeZone: timezone }).format();
    } catch {
      setMessage("有効なタイムゾーンを入力してください");
      return;
    }
    await api.savePreferences({
      timezone,
      defaultDurationMinutes: parsed,
      defaultDestinationIds: defaultIds,
    });
    setMessage("予定設定を保存しました");
  };
  return (
    <section>
      <p className="text-sm font-semibold text-teal-700">設定</p>
      <h1 className="mt-2 text-3xl font-semibold">予定設定</h1>
      <form
        className="mt-8 grid max-w-xl gap-5 rounded-3xl border border-stone-200 bg-white p-6"
        onSubmit={(event) => void submit(event)}
      >
        <label className="grid gap-2 text-sm font-semibold">
          タイムゾーン
          <input
            className="rounded-xl border border-stone-300 px-3 py-2"
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          デフォルト所要時間（分）
          <input
            className="rounded-xl border border-stone-300 px-3 py-2"
            inputMode="numeric"
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
          />
        </label>
        <fieldset>
          <legend className="text-sm font-semibold">登録先未指定時</legend>
          <div className="mt-2 grid gap-2">
            {destinations
              .filter(({ enabled }) => enabled)
              .map((destination) => (
                <label
                  key={destination.destinationId}
                  className="flex gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={defaultIds.includes(destination.destinationId)}
                    onChange={(event) =>
                      setDefaultIds((current) =>
                        event.target.checked
                          ? [...current, destination.destinationId]
                          : current.filter(
                              (id) => id !== destination.destinationId,
                            ),
                      )
                    }
                  />
                  {destination.name}
                </label>
              ))}
          </div>
        </fieldset>
        {message === null ? null : (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
        <Button type="submit">予定設定を保存</Button>
      </form>
    </section>
  );
}
