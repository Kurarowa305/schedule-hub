import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { createScheduleHubApp } from "../src/app.js";

function apiTemplate(): Template {
  const assembly = createScheduleHubApp().synth();
  return Template.fromJSON(
    assembly.getStackByName("ScheduleHub-main-Api").template,
  );
}

describe("本番API runtime", () => {
  it("MCP・Web・Calendar OAuthをasset Lambdaへ分離してDynamoDBへ接続する", () => {
    const template = apiTemplate();

    template.resourceCountIs("AWS::Lambda::Function", 3);
    for (const handlerName of [
      "McpLambda",
      "WebApiLambda",
      "CalendarOAuthLambda",
    ]) {
      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: `schedule-hub-main-${handlerName}`,
        Runtime: "nodejs22.x",
        Environment: {
          Variables: Match.objectLike({ TABLE_NAME: Match.anyValue() }),
        },
        Code: Match.objectLike({
          S3Bucket: Match.anyValue(),
          S3Key: Match.anyValue(),
        }),
      });
    }
    expect(JSON.stringify(template.toJSON())).not.toContain("statusCode: 501");
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Action: Match.arrayWith(["dynamodb:GetItem"]) }),
        ]),
      },
    });
  });

  it("JWT AuthorizerをWeb/MCPで分け、OAuth callbackのみ未認証にする", () => {
    const template = apiTemplate();

    template.resourceCountIs("AWS::ApiGatewayV2::Authorizer", 2);
    template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
      RouteKey: "POST /mcp",
      AuthorizationType: "JWT",
      AuthorizationScopes: ["schedule-hub-mcp/use"],
    });
    template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
      RouteKey: "ANY /api/v1/{proxy+}",
      AuthorizationType: "JWT",
    });
    template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
      RouteKey: "GET /api/v1/oauth/{provider}/callback",
      AuthorizationType: "NONE",
    });
  });

  it("MCP protected resource metadataとCORS preflightを公開する", () => {
    const template = apiTemplate();

    for (const routeKey of [
      "GET /.well-known/oauth-protected-resource",
      "GET /.well-known/oauth-protected-resource/mcp",
    ]) {
      template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
        RouteKey: routeKey,
        AuthorizationType: "NONE",
      });
    }
    template.hasResourceProperties("AWS::ApiGatewayV2::Api", {
      CorsConfiguration: Match.objectLike({
        AllowHeaders: Match.arrayWith(["authorization", "content-type"]),
        AllowMethods: Match.arrayWith([
          "GET",
          "POST",
          "PATCH",
          "PUT",
          "DELETE",
        ]),
      }),
    });
  });
});
