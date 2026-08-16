import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, it } from "vitest";
import { createScheduleHubApp } from "../src/app.js";

describe("DynamoDB Single Table", () => {
  it("PK/SK、GSI1、OAuthState用TTLを定義する", () => {
    const assembly = createScheduleHubApp().synth();
    const template = Template.fromJSON(
      assembly.getStackByName("ScheduleHub-main-Data").template,
    );

    template.hasResourceProperties("AWS::DynamoDB::Table", {
      BillingMode: "PAY_PER_REQUEST",
      KeySchema: [
        { AttributeName: "PK", KeyType: "HASH" },
        { AttributeName: "SK", KeyType: "RANGE" },
      ],
      TimeToLiveSpecification: {
        AttributeName: "ttl",
        Enabled: true,
      },
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: "GSI1",
          KeySchema: [
            { AttributeName: "GSI1PK", KeyType: "HASH" },
            { AttributeName: "GSI1SK", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        }),
      ]),
    });
  });
});
