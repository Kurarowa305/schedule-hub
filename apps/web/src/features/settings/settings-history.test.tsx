import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import {
  DestinationSettingsPage,
  ExternalDisplaySettingsPage,
  OperationHistoryPage,
  type SettingsHistoryApi,
} from "./settings-history.js";

const api: SettingsHistoryApi = {
  saveDestination: vi.fn(async () => undefined),
  saveDisplayTarget: vi.fn(async () => undefined),
};

describe("登録先設定", () => {
  it("名称と書込可能Calendar Mappingがない不正フォームを拒否する", async () => {
    const saveDestination = vi.fn(async () => undefined);
    renderPage(
      <DestinationSettingsPage
        api={{ ...api, saveDestination }}
        calendars={[
          {
            physicalCalendarId: "pcal_reader",
            name: "閲覧用",
            writable: false,
          },
        ]}
        destinations={[]}
      />,
    );
    const user = userEvent.setup();

    expect(screen.getByRole("checkbox", { name: /閲覧用/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "登録先を保存" }));

    expect(screen.getByText("登録先名を入力してください")).toBeVisible();
    expect(
      screen.getByText("書き込み可能なカレンダーを1つ以上選択してください"),
    ).toBeVisible();
    expect(saveDestination).not.toHaveBeenCalled();
  });

  it("有効な入力だけをAPIへ保存する", async () => {
    const saveDestination = vi.fn(async () => undefined);
    renderPage(
      <DestinationSettingsPage
        api={{ ...api, saveDestination }}
        calendars={[
          { physicalCalendarId: "pcal_work", name: "仕事", writable: true },
        ]}
        destinations={[]}
      />,
    );
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("登録先名"), "仕事");
    await user.type(screen.getByLabelText(/^別名/), "会社, 業務");
    await user.type(
      screen.getByLabelText("どんな予定に使いますか？"),
      "仕事の予定",
    );
    await user.click(screen.getByRole("checkbox", { name: /仕事/ }));
    await user.click(screen.getByRole("button", { name: "登録先を保存" }));

    expect(saveDestination).toHaveBeenCalledWith({
      name: "仕事",
      aliases: ["会社", "業務"],
      description: "仕事の予定",
      physicalCalendarIds: ["pcal_work"],
    });
  });
});

describe("外部カレンダー表示", () => {
  it("TimeTree/Yahooへの直接登録や表示成功を保証しないと明示する", () => {
    renderPage(
      <ExternalDisplaySettingsPage api={api} calendars={[]} targets={[]} />,
    );

    expect(
      screen.getByText(/TimeTreeやYahooへ予定を直接登録する機能ではありません/),
    ).toBeVisible();
    expect(
      screen.getByText(/端末側の同期状態によって表示されない場合があります/),
    ).toBeVisible();
    expect(
      screen.getByText(
        /TimeTree共有カレンダーへの自動登録には対応していません/,
      ),
    ).toBeVisible();
  });
});

describe("操作履歴", () => {
  it("部分成功をGoogle Calendar単位の結果として表示し30日保持を案内する", () => {
    renderPage(
      <OperationHistoryPage
        operations={[
          {
            operationId: "op_1",
            title: "顧客との定例",
            start: "2026-08-17T10:00:00+09:00",
            end: "2026-08-17T11:00:00+09:00",
            status: "PARTIAL_SUCCESS",
            createdAt: "2026-08-16T14:00:00+09:00",
            events: [
              {
                physicalCalendarId: "pcal_1",
                status: "SUCCESS",
                errorCode: null,
              },
              {
                physicalCalendarId: "pcal_2",
                status: "FAILED",
                errorCode: "PROVIDER_API_ERROR",
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText("一部成功")).toBeVisible();
    expect(
      screen.getByText("Google Calendar: 成功 1件 / 失敗 1件"),
    ).toBeVisible();
    expect(screen.getByText(/操作ログは30日間保持/)).toBeVisible();
    expect(screen.queryByText(/TimeTree.*成功/)).not.toBeInTheDocument();
  });
});

function renderPage(element: React.ReactNode) {
  return render(<MemoryRouter>{element}</MemoryRouter>);
}
