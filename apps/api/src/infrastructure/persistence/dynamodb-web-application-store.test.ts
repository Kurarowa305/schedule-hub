import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { createPhysicalCalendar } from "@schedule-hub/shared";
import { expect, it, vi } from "vitest";
import { DynamoDbWebApplicationStore } from "./dynamodb-web-application-store.js";

it("Physical Calendar更新時に既存のcreatedAtを維持する", async () => {
  const send = vi
    .fn()
    .mockResolvedValueOnce({ Item: { createdAt: "2026-01-01T00:00:00.000Z" } })
    .mockResolvedValueOnce({});
  const store = new DynamoDbWebApplicationStore(
    { send } as never,
    "ScheduleHub",
  );

  await store.putPhysicalCalendar(
    "user-1",
    createPhysicalCalendar({
      physicalCalendarId: "pcal-1",
      provider: "GOOGLE",
      connectionId: "conn-1",
      externalCalendarId: "work@example.com",
      name: "仕事",
      accessRole: "owner",
      writable: true,
      status: "ACTIVE",
      eventColorId: "5",
    }),
  );

  expect(send.mock.calls[0]?.[0]).toBeInstanceOf(GetCommand);
  expect(send.mock.calls[1]?.[0]).toBeInstanceOf(PutCommand);
  expect(send.mock.calls[1]?.[0].input.Item).toMatchObject({
    createdAt: "2026-01-01T00:00:00.000Z",
    physicalCalendarId: "pcal-1",
  });
});
