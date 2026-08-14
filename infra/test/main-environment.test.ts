import { describe, expect, it } from "vitest";
import { Template } from "aws-cdk-lib/assertions";
import { createScheduleHubApp } from "../src/app.js";

describe("単一main環境", () => {
  it("4つのスタックと主要AWSリソースを合成する", () => {
    const app = createScheduleHubApp();
    const assembly = app.synth();

    const dataTemplate = Template.fromJSON(
      assembly.getStackByName("ScheduleHub-main-Data").template,
    );
    const apiTemplate = Template.fromJSON(
      assembly.getStackByName("ScheduleHub-main-Api").template,
    );
    const authTemplate = Template.fromJSON(
      assembly.getStackByName("ScheduleHub-main-Auth").template,
    );
    const frontendTemplate = Template.fromJSON(
      assembly.getStackByName("ScheduleHub-main-Frontend").template,
    );

    dataTemplate.resourceCountIs("AWS::DynamoDB::Table", 1);
    apiTemplate.resourceCountIs("AWS::ApiGatewayV2::Api", 1);
    authTemplate.resourceCountIs("AWS::Cognito::UserPool", 1);
    frontendTemplate.resourceCountIs("AWS::S3::Bucket", 1);
    frontendTemplate.resourceCountIs("AWS::CloudFront::Distribution", 1);

    expect(assembly.stacks.map((stack) => stack.stackName).sort()).toEqual([
      "ScheduleHub-main-Api",
      "ScheduleHub-main-Auth",
      "ScheduleHub-main-Data",
      "ScheduleHub-main-Frontend",
    ]);
  });
});
