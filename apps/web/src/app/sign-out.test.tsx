import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { App, type AuthSessionStore } from "./app.js";

it("サインアウト直後にセッションを破棄してサインインへ遷移する", async () => {
  const clear = vi.fn<AuthSessionStore["clear"]>(async () => undefined);
  const store: AuthSessionStore = {
    load: vi.fn(async () => ({
      userId: "user-1",
      accessToken: "access-token",
      expiresAt: Date.parse("2026-08-17T12:00:00.000Z"),
    })),
    clear,
  };
  render(
    <App
      authSessionStore={store}
      initialPath="/dashboard"
      now={() => Date.parse("2026-08-16T06:00:00.000Z")}
    />,
  );
  const user = userEvent.setup();

  await user.click(await screen.findByRole("button", { name: "サインアウト" }));

  expect(
    await screen.findByRole("heading", { name: "Schedule Hubへサインイン" }),
  ).toBeVisible();
  expect(clear).toHaveBeenCalledOnce();
});
