import { describe, expect, it } from "vitest";
import { createOperationPayloadHash } from "./operation-payload-hash.js";

const payload = {
  userId: "user-1",
  title: "顧客との定例",
  start: "2026-08-14T10:00:00+09:00",
  end: "2026-08-14T11:00:00+09:00",
  destinationIds: ["work", "private"],
};

describe("CreateOperation payload hash", () => {
  it("Destination順序に依存しないSHA-256を生成する", async () => {
    const first = await createOperationPayloadHash(payload);
    const reordered = await createOperationPayloadHash({
      ...payload,
      destinationIds: ["private", "work"],
    });

    expect(first).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(reordered).toBe(first);
  });

  it("予定内容が異なれば異なるhashを生成する", async () => {
    await expect(
      createOperationPayloadHash({ ...payload, title: "別の予定" }),
    ).resolves.not.toBe(await createOperationPayloadHash(payload));
  });
});
