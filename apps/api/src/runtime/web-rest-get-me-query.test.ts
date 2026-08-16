import { createUserPreference } from "@schedule-hub/shared";
import { expect, it, vi } from "vitest";
import {
  createWebRestExecutor,
  type WebApplicationStore,
} from "./web-rest-executor.js";

it("GET_MEではPreferenceを一度だけ読み取る", async () => {
  const preference = createUserPreference({
    timezone: "Asia/Tokyo",
    defaultDurationMinutes: 30,
    defaultDestinationIds: [],
  });
  const getUserPreference = vi.fn(async () => preference);
  const store = {
    getUserPreference,
    putUserPreference: vi.fn(),
  } as unknown as WebApplicationStore;

  await createWebRestExecutor({ store }).execute({
    operation: "GET_ME",
    userId: "user-1",
    pathParameters: {},
    query: {},
    body: null,
  });

  expect(getUserPreference).toHaveBeenCalledOnce();
  expect(store.putUserPreference).not.toHaveBeenCalled();
});
