import {
  createLogicalDestination,
  createUserPreference,
  type LogicalDestination,
  type UserPreference,
} from "@schedule-hub/shared";
import { describe, expect, it, vi } from "vitest";
import type { Page } from "../ports/schedule-hub-repository.js";
import {
  GetScheduleContextService,
  type ScheduleContextStore,
} from "./get-schedule-context-service.js";

const preference = createUserPreference({
  timezone: "Asia/Tokyo",
  defaultDurationMinutes: 60,
  defaultDestinationIds: ["dest-work", "dest-disabled"],
});

function destination(
  destinationId: string,
  enabled = true,
): LogicalDestination {
  return createLogicalDestination({
    destinationId,
    name: destinationId === "dest-work" ? "仕事" : "無効",
    aliases: destinationId === "dest-work" ? ["業務"] : ["旧用途"],
    description:
      destinationId === "dest-work" ? "仕事の予定" : "現在は利用しない予定",
    physicalCalendarIds: ["pcal-secret"],
    enabled,
  });
}

function fixture(options?: {
  readonly preference?: UserPreference | null;
  readonly pages?: readonly Page<LogicalDestination>[];
  readonly now?: Date;
}) {
  const pages = [
    ...(options?.pages ?? [
      {
        items: [destination("dest-work"), destination("dest-disabled", false)],
        nextCursor: null,
      },
    ]),
  ];
  const store: ScheduleContextStore = {
    getUserPreference: vi.fn(async () =>
      options !== undefined && "preference" in options
        ? (options.preference ?? null)
        : preference,
    ),
    listLogicalDestinations: vi.fn(async () => {
      const page = pages.shift();
      if (page === undefined) throw new Error("unexpected page request");
      return page;
    }),
  };
  const service = new GetScheduleContextService({
    store,
    now: () => options?.now ?? new Date("2026-08-17T01:23:45.678Z"),
  });
  return { service, store };
}

describe("get_schedule_context", () => {
  it("現在日時をUserPreferenceのIANA Time Zoneへ変換する", async () => {
    const { service } = fixture();

    await expect(service.get("user-1")).resolves.toMatchObject({
      currentDateTime: "2026-08-17T10:23:45+09:00",
      timezone: "Asia/Tokyo",
      defaultDurationMinutes: 60,
    });
  });

  it("DSTを含むTimezoneのUTC offsetを現在日時に応じて返す", async () => {
    const newYorkPreference = createUserPreference({
      ...preference,
      timezone: "America/New_York",
    });
    const { service } = fixture({
      preference: newYorkPreference,
      now: new Date("2026-07-01T12:00:00.000Z"),
    });

    await expect(service.get("user-1")).resolves.toMatchObject({
      currentDateTime: "2026-07-01T08:00:00-04:00",
    });
  });

  it("無効Destinationとそのdefault IDを返さず内部情報を遮断する", async () => {
    const { service } = fixture();

    const result = await service.get("user-1");

    expect(result.defaultDestinationIds).toEqual(["dest-work"]);
    expect(result.destinations).toEqual([
      {
        id: "dest-work",
        name: "仕事",
        aliases: ["業務"],
        description: "仕事の予定",
      },
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /pcal-secret|physicalCalendar|provider|token/i,
    );
  });

  it("全ページを取得して有効Destinationを返す", async () => {
    const first = destination("dest-work");
    const second = createLogicalDestination({
      destinationId: "dest-private",
      name: "個人",
      aliases: ["自分"],
      description: "個人の予定",
      physicalCalendarIds: ["pcal-private"],
      enabled: true,
    });
    const { service, store } = fixture({
      pages: [
        { items: [first], nextCursor: "next-page" },
        { items: [second], nextCursor: null },
      ],
    });

    await expect(service.get("user-1")).resolves.toMatchObject({
      destinations: [
        expect.objectContaining({ id: "dest-work" }),
        expect.objectContaining({ id: "dest-private" }),
      ],
    });
    expect(store.listLogicalDestinations).toHaveBeenNthCalledWith(
      1,
      "user-1",
      50,
      undefined,
    );
    expect(store.listLogicalDestinations).toHaveBeenNthCalledWith(
      2,
      "user-1",
      50,
      "next-page",
    );
  });

  it("UserPreferenceが未作成ならDestinationを取得せず停止する", async () => {
    const { service, store } = fixture({ preference: null });

    await expect(service.get("user-1")).rejects.toThrow(
      "ユーザー設定が見つかりません",
    );
    expect(store.listLogicalDestinations).not.toHaveBeenCalled();
  });
});
