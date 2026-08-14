import { describe, expect, it } from "vitest";
import {
  createLogicalDestination,
  createLogicalDestinationCatalog,
  disableDestinationMapping,
} from "./logical-destination.js";

const createInput = (index: number) => ({
  destinationId: `destination-${index}`,
  name: `登録先${index}`,
  aliases: [`alias-${index}`],
  description: `登録先${index}の説明`,
  physicalCalendarIds: [`calendar-${index}`],
  enabled: true,
});

describe("Logical Destination", () => {
  it("名前とaliasが正規化後に重複するCatalogは生成できない", () => {
    expect(() =>
      createLogicalDestinationCatalog([
        createInput(1),
        { ...createInput(2), aliases: ["　登録先1　"] },
      ]),
    ).toThrowError(
      expect.objectContaining({ code: "DUPLICATE_DESTINATION_TERM" }),
    );
  });

  it("51件のDestinationを持つCatalogは生成できない", () => {
    expect(() =>
      createLogicalDestinationCatalog(
        Array.from({ length: 51 }, (_, index) => createInput(index)),
      ),
    ).toThrowError(
      expect.objectContaining({ code: "DESTINATION_LIMIT_EXCEEDED" }),
    );
  });

  it("最後のMappingを無効化するとDestinationも無効になる", () => {
    const destination = createLogicalDestination(createInput(1));

    const disabled = disableDestinationMapping(destination, "calendar-1");

    expect(disabled).toMatchObject({
      enabled: false,
      physicalCalendarIds: [],
    });
    expect(destination).toMatchObject({
      enabled: true,
      physicalCalendarIds: ["calendar-1"],
    });
  });
});
