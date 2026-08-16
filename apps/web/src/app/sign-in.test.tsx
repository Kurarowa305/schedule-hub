import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { App, type AuthSessionStore } from "./app.js";

it("Googleで続ける操作をCognitoサインイン開始処理へ委譲する", async () => {
  const onSignIn = vi.fn(async () => undefined);
  const store: AuthSessionStore = {
    load: vi.fn(async () => null),
    clear: vi.fn(async () => undefined),
  };
  render(
    <App authSessionStore={store} initialPath="/signin" onSignIn={onSignIn} />,
  );

  await userEvent
    .setup()
    .click(await screen.findByRole("button", { name: "Googleで続ける" }));

  expect(onSignIn).toHaveBeenCalledOnce();
});
