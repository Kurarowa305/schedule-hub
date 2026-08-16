import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { createScheduleHubApp } from "../src/app.js";

function authTemplate(): Template {
  const assembly = createScheduleHubApp().synth();
  return Template.fromJSON(
    assembly.getStackByName("ScheduleHub-main-Auth").template,
  );
}

describe("Cognito Web/MCP認証", () => {
  it("同一User PoolにGoogle IdPと公開App Clientを2つ構成する", () => {
    const template = authTemplate();

    template.resourceCountIs("AWS::Cognito::UserPool", 1);
    template.resourceCountIs("AWS::Cognito::UserPoolIdentityProvider", 1);
    template.resourceCountIs("AWS::Cognito::UserPoolClient", 2);
    template.resourceCountIs("AWS::Cognito::UserPoolDomain", 1);

    template.hasResourceProperties("AWS::Cognito::UserPoolIdentityProvider", {
      ProviderName: "Google",
      ProviderType: "Google",
      ProviderDetails: {
        client_id: { Ref: "GoogleLoginClientId" },
        client_secret: { Ref: "GoogleLoginClientSecret" },
        authorize_scopes: "openid email profile",
      },
      AttributeMapping: Match.objectLike({ email: "email" }),
    });

    for (const clientName of [
      "schedule-hub-main-web",
      "schedule-hub-main-mcp",
    ]) {
      template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
        ClientName: clientName,
        GenerateSecret: false,
        AllowedOAuthFlowsUserPoolClient: true,
        AllowedOAuthFlows: ["code"],
        SupportedIdentityProviders: ["Google"],
      });
    }
  });

  it("WebはOIDC scope、MCPは専用scopeとClaude callbackを許可する", () => {
    const template = authTemplate();

    template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
      ClientName: "schedule-hub-main-web",
      CallbackURLs: [{ Ref: "WebCallbackUrl" }],
      LogoutURLs: [{ Ref: "WebLogoutUrl" }],
      AllowedOAuthScopes: Match.arrayWith(["openid", "email", "profile"]),
    });
    template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
      ClientName: "schedule-hub-main-mcp",
      CallbackURLs: [
        "https://claude.ai/api/mcp/auth_callback",
        "https://claude.com/api/mcp/auth_callback",
      ],
      AllowedOAuthScopes: Match.arrayWith([
        "openid",
        "email",
        "profile",
        "schedule-hub-mcp/use",
      ]),
    });
    template.hasResourceProperties("AWS::Cognito::UserPoolResourceServer", {
      Identifier: "schedule-hub-mcp",
      Name: "Schedule Hub MCP",
      Scopes: [{ ScopeName: "use", ScopeDescription: Match.anyValue() }],
    });
  });

  it("Google secretをリポジトリや合成テンプレートへ平文保存しない", () => {
    const template = authTemplate().toJSON() as {
      Parameters: Record<string, { NoEcho?: boolean }>;
    };

    expect(template.Parameters.GoogleLoginClientSecret).toMatchObject({
      NoEcho: true,
    });
    expect(JSON.stringify(template)).not.toContain(
      "google-client-secret-value",
    );
  });
});
