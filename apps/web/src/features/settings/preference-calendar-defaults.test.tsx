import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { BrowserSettingsApi } from "../../api/settings-history-api.js";
import { PreferenceSettingsPage } from "./settings-route-page.js";

it("通知・予定色・公開範囲の既定値を保存する", async () => {
  const savePreferences = vi.fn(async () => undefined);
  const api: BrowserSettingsApi = {
    savePreferences,
    load: vi.fn(),
    saveDestination: vi.fn(),
    saveDisplayTarget: vi.fn(),
  };
  render(
    <PreferenceSettingsPage
      api={api}
      initial={{
        timezone: "Asia/Tokyo",
        defaultDurationMinutes: 60,
        defaultDestinationIds: [],
        defaultReminderMinutes: [10],
        defaultEventColorId: "5",
        defaultVisibility: "private",
      }}
      destinations={[]}
    />,
  );
  const user = userEvent.setup();

  await user.clear(screen.getByLabelText("通知（分前・カンマ区切り）"));
  await user.type(
    screen.getByLabelText("通知（分前・カンマ区切り）"),
    "30, 10",
  );
  await user.selectOptions(screen.getByLabelText("公開範囲"), "public");
  await user.click(screen.getByRole("button", { name: "予定設定を保存" }));

  expect(savePreferences).toHaveBeenCalledWith({
    timezone: "Asia/Tokyo",
    defaultDurationMinutes: 60,
    defaultDestinationIds: [],
    defaultReminderMinutes: [30, 10],
    defaultEventColorId: "5",
    defaultVisibility: "public",
  });
});
