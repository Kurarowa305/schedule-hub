const timeTreeHelpUrl =
  "https://support.timetreeapp.com/hc/ja/articles/115000030881";
const yahooHelpUrl =
  "https://support.yahoo-net.jp/SaaCalendar/s/article/H000011822";

export function ExternalDisplayGuide() {
  return (
    <section className="mt-6" aria-labelledby="external-display-guide-title">
      <h2 id="external-display-guide-title" className="text-xl font-semibold">
        端末でBridge Calendarを表示する手順
      </h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        表示名やメニュー位置はアプリ・OSの更新で変わる場合があります。見つからない場合は公式ヘルプを確認してください。
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <GuideCard
          title="TimeTree"
          helpUrl={timeTreeHelpUrl}
          ios="iPhoneの設定でGoogleアカウントのカレンダー同期を有効にします。TimeTreeのホームカレンダーで「表示するフィルターを選択」を開き、Bridge Calendarをオンにします。"
          android="Androidの設定で対象Googleアカウントのカレンダー同期を有効にします。TimeTreeのホームカレンダーで「表示するフィルターを選択」を開き、Bridge Calendarをオンにします。"
        />
        <GuideCard
          title="Yahoo!カレンダー"
          helpUrl={yahooHelpUrl}
          ios="iPhoneの標準カレンダーでGoogleアカウントのBridge Calendarを表示します。Yahoo!カレンダーの「アプリ基本設定」から「表示するカレンダーを選ぶ」を開き、Bridge Calendarをオンにします。"
          android="AndroidのGoogleアカウント同期でカレンダーをオンにします。Yahoo!カレンダーの「アプリ基本設定」から「表示するカレンダーを選ぶ」を開き、Bridge Calendarをオンにします。"
        />
      </div>
    </section>
  );
}

function GuideCard({
  title,
  ios,
  android,
  helpUrl,
}: {
  readonly title: string;
  readonly ios: string;
  readonly android: string;
  readonly helpUrl: string;
}) {
  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-5">
      <h3 className="font-semibold text-stone-950">{title}</h3>
      <h4 className="mt-4 text-sm font-semibold text-teal-800">iOS</h4>
      <p className="mt-1 text-sm leading-6 text-stone-600">{ios}</p>
      <h4 className="mt-4 text-sm font-semibold text-teal-800">Android</h4>
      <p className="mt-1 text-sm leading-6 text-stone-600">{android}</p>
      <a
        className="mt-4 inline-flex text-sm font-semibold text-teal-800 underline underline-offset-4"
        href={helpUrl}
        target="_blank"
        rel="noreferrer"
      >
        公式ヘルプを確認
      </a>
    </article>
  );
}
