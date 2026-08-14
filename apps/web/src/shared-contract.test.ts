import { describe, expect, it } from "vitest";
import { scheduleTypeValues } from "@schedule-hub/shared";

describe("共有契約", () => {
  it("Webアプリは共有パッケージから予定種別を取得できる", () => {
    expect(scheduleTypeValues).toEqual(["TIMED", "ALL_DAY"]);
  });
});
