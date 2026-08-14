import { describe, expect, it } from "vitest";
import { createPhysicalCalendar } from "./physical-calendar.js";

describe("Physical Calendar", () => {
  it("削除済みCalendarを書き込み可能として生成できない", () => {
    expect(() =>
      createPhysicalCalendar({
        physicalCalendarId: "calendar-work",
        provider: "GOOGLE",
        connectionId: "connection-google",
        externalCalendarId: "work@example.com",
        name: "仕事",
        accessRole: "owner",
        writable: true,
        status: "DELETED",
        eventColorId: null,
      }),
    ).toThrowError(
      expect.objectContaining({ code: "DELETED_CALENDAR_WRITABLE" }),
    );
  });

  it("有効なCalendarを生成できる", () => {
    expect(
      createPhysicalCalendar({
        physicalCalendarId: " calendar-work ",
        provider: "GOOGLE",
        connectionId: "connection-google",
        externalCalendarId: "work@example.com",
        name: " 仕事 ",
        accessRole: "writer",
        writable: true,
        status: "ACTIVE",
        eventColorId: null,
      }),
    ).toMatchObject({
      physicalCalendarId: "calendar-work",
      name: "仕事",
      writable: true,
      status: "ACTIVE",
    });
  });
});
