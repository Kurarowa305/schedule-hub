import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { ExternalDisplaySettingsPage } from "./settings-history.js";

it("TimeTreeとYahooのiOS/Android外部表示手順と公式ヘルプを案内する", () => {
  render(
    <MemoryRouter>
      <ExternalDisplaySettingsPage
        api={{
          saveDestination: vi.fn(),
          saveDisplayTarget: vi.fn(),
        }}
        calendars={[]}
        targets={[]}
      />
    </MemoryRouter>,
  );

  expect(screen.getAllByText("iOS")).toHaveLength(2);
  expect(screen.getAllByText("Android")).toHaveLength(2);
  expect(screen.getAllByText(/TimeTreeのホームカレンダー/)).toHaveLength(2);
  expect(screen.getAllByText(/表示するフィルターを選択/)).toHaveLength(2);
  expect(
    screen.getAllByText(/Yahoo!カレンダー.*表示するカレンダーを選ぶ/),
  ).toHaveLength(2);
  expect(
    screen.getAllByRole("link", { name: "公式ヘルプを確認" }),
  ).toHaveLength(2);
  expect(
    screen.getByText(/表示名やメニュー位置はアプリ.*更新で変わる/),
  ).toBeVisible();
});
