import { Match, Template } from "aws-cdk-lib/assertions";
import { it } from "vitest";
import { createScheduleHubApp } from "../src/app.js";

it("MCP Lambdaへ実APIのresource URIを渡す", () => {
  const assembly = createScheduleHubApp().synth();
  const template = Template.fromJSON(
    assembly.getStackByName("ScheduleHub-main-Api").template,
  );

  template.hasResourceProperties("AWS::Lambda::Function", {
    FunctionName: "schedule-hub-main-McpLambda",
    Environment: {
      Variables: Match.objectLike({ MCP_RESOURCE: Match.anyValue() }),
    },
  });
});
