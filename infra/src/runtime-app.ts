import {
  App,
  Aws,
  CfnOutput,
  CfnParameter,
  Duration,
  RemovalPolicy,
  SecretValue,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import { fileURLToPath } from "node:url";

const stage = "main";
const stackName = (name: string) => `ScheduleHub-${stage}-${name}`;
const apiEntry = (name: string) =>
  fileURLToPath(
    new URL(`../../apps/api/src/runtime/${name}.ts`, import.meta.url),
  );

class DataStack extends Stack {
  public readonly table: dynamodb.Table;

  public constructor(scope: App, props: StackProps = {}) {
    super(scope, "Data", { ...props, stackName: stackName("Data") });
    this.table = new dynamodb.Table(this, "ScheduleHubTable", {
      tableName: "schedule-hub-main",
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      timeToLiveAttribute: "ttl",
      removalPolicy: RemovalPolicy.RETAIN,
    });
    this.table.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: { name: "GSI1PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "GSI1SK", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
  }
}

class AuthStack extends Stack {
  public readonly userPool: cognito.UserPool;
  public readonly webClient: cognito.UserPoolClient;
  public readonly mcpClient: cognito.UserPoolClient;
  public readonly domain: cognito.UserPoolDomain;

  public constructor(scope: App, props: StackProps = {}) {
    super(scope, "Auth", { ...props, stackName: stackName("Auth") });
    const googleClientId = new CfnParameter(this, "GoogleLoginClientId", {
      type: "String",
      description: "Cognito Google IdP用OAuth Client ID",
    });
    const googleClientSecret = new CfnParameter(
      this,
      "GoogleLoginClientSecret",
      {
        type: "String",
        noEcho: true,
        description: "Cognito Google IdP用OAuth Client Secret",
      },
    );
    const webCallbackUrl = new CfnParameter(this, "WebCallbackUrl", {
      type: "String",
      default: "http://localhost:5173/auth/callback",
      description: "Web SPAのCognito callback URL",
    });
    const webLogoutUrl = new CfnParameter(this, "WebLogoutUrl", {
      type: "String",
      default: "http://localhost:5173/",
      description: "Web SPAのCognito logout URL",
    });

    this.userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: "schedule-hub-main",
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const googleProvider = new cognito.UserPoolIdentityProviderGoogle(
      this,
      "GoogleIdentityProvider",
      {
        userPool: this.userPool,
        clientId: googleClientId.valueAsString,
        clientSecretValue: SecretValue.cfnParameter(googleClientSecret),
        scopes: ["openid", "email", "profile"],
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          fullname: cognito.ProviderAttribute.GOOGLE_NAME,
        },
      },
    );
    this.domain = this.userPool.addDomain("Domain", {
      cognitoDomain: { domainPrefix: `schedule-hub-${Aws.ACCOUNT_ID}` },
    });
    const mcpScope = new cognito.ResourceServerScope({
      scopeName: "use",
      scopeDescription: "Schedule Hub MCP toolsを利用する",
    });
    const mcpResourceServer = this.userPool.addResourceServer(
      "McpResourceServer",
      {
        identifier: "schedule-hub-mcp",
        userPoolResourceServerName: "Schedule Hub MCP",
        scopes: [mcpScope],
      },
    );
    const commonClientOptions = {
      generateSecret: false,
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.GOOGLE,
      ],
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
      },
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
    } satisfies cognito.UserPoolClientOptions;
    this.webClient = this.userPool.addClient("WebClient", {
      ...commonClientOptions,
      userPoolClientName: "schedule-hub-main-web",
      oAuth: {
        ...commonClientOptions.oAuth,
        callbackUrls: [webCallbackUrl.valueAsString],
        logoutUrls: [webLogoutUrl.valueAsString],
      },
    });
    this.mcpClient = this.userPool.addClient("McpClient", {
      ...commonClientOptions,
      userPoolClientName: "schedule-hub-main-mcp",
      oAuth: {
        ...commonClientOptions.oAuth,
        callbackUrls: [
          "https://claude.ai/api/mcp/auth_callback",
          "https://claude.com/api/mcp/auth_callback",
        ],
        scopes: [
          ...commonClientOptions.oAuth.scopes,
          cognito.OAuthScope.custom("schedule-hub-mcp/use"),
        ],
      },
    });
    this.webClient.node.addDependency(googleProvider);
    this.mcpClient.node.addDependency(googleProvider);
    this.mcpClient.node.addDependency(mcpResourceServer);
    new CfnOutput(this, "UserPoolId", { value: this.userPool.userPoolId });
    new CfnOutput(this, "WebClientId", {
      value: this.webClient.userPoolClientId,
    });
    new CfnOutput(this, "McpClientId", {
      value: this.mcpClient.userPoolClientId,
    });
    new CfnOutput(this, "CognitoDomain", { value: this.domain.domainName });
  }
}

interface ApiStackProps extends StackProps {
  readonly table: dynamodb.Table;
  readonly auth: AuthStack;
}

class ApiStack extends Stack {
  public readonly api: apigwv2.HttpApi;
  public constructor(scope: App, props: ApiStackProps) {
    super(scope, "Api", { ...props, stackName: stackName("Api") });
    const calendarClientId = new CfnParameter(this, "GoogleCalendarClientId", {
      type: "String",
      description: "Calendar連携用Google OAuth Client ID",
    });
    const calendarClientSecret = new CfnParameter(
      this,
      "GoogleCalendarClientSecret",
      {
        type: "String",
        noEcho: true,
        description: "Calendar連携用Google OAuth Client Secret",
      },
    );
    const calendarRedirectUri = new CfnParameter(
      this,
      "GoogleCalendarRedirectUri",
      {
        type: "String",
        description: "Calendar連携用Google OAuth callback URL",
      },
    );
    const webBaseUrl = new CfnParameter(this, "WebBaseUrl", {
      type: "String",
      default: "http://localhost:5173",
      description: "OAuth完了後のWeb SPA URL",
    });

    const commonEnvironment = {
      TABLE_NAME: props.table.tableName,
      USER_POOL_ID: props.auth.userPool.userPoolId,
      WEB_CLIENT_ID: props.auth.webClient.userPoolClientId,
      MCP_CLIENT_ID: props.auth.mcpClient.userPoolClientId,
      COGNITO_DOMAIN: props.auth.domain.domainName,
    };
    const createFunction = (
      id: string,
      entry: string,
      environment: Readonly<Record<string, string>> = {},
    ) =>
      new lambdaNode.NodejsFunction(this, id, {
        functionName: `schedule-hub-main-${id}`,
        runtime: lambda.Runtime.NODEJS_22_X,
        entry: apiEntry(entry),
        handler: "handler",
        timeout: Duration.seconds(15),
        memorySize: 512,
        environment: { ...commonEnvironment, ...environment },
        bundling: { minify: true, sourceMap: true, target: "node22" },
      });

    const mcpLambda = createFunction("McpLambda", "mcp-handler", {
      GOOGLE_CALENDAR_CLIENT_ID: calendarClientId.valueAsString,
      GOOGLE_CALENDAR_CLIENT_SECRET: calendarClientSecret.valueAsString,
    });
    const webLambda = createFunction("WebApiLambda", "web-api-handler");
    const oauthLambda = createFunction(
      "CalendarOAuthLambda",
      "calendar-oauth-handler",
      {
        GOOGLE_CALENDAR_CLIENT_ID: calendarClientId.valueAsString,
        GOOGLE_CALENDAR_CLIENT_SECRET: calendarClientSecret.valueAsString,
        GOOGLE_CALENDAR_REDIRECT_URI: calendarRedirectUri.valueAsString,
        WEB_BASE_URL: webBaseUrl.valueAsString,
      },
    );
    props.table.grantReadWriteData(mcpLambda);
    props.table.grantReadWriteData(webLambda);
    props.table.grantReadWriteData(oauthLambda);

    this.api = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: "schedule-hub-main",
      corsPreflight: {
        allowOrigins: [webBaseUrl.valueAsString],
        allowHeaders: ["authorization", "content-type"],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PATCH,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.DELETE,
        ],
      },
    });
    mcpLambda.addEnvironment("MCP_RESOURCE", `${this.api.apiEndpoint}/mcp`);
    const issuer = `https://cognito-idp.${Aws.REGION}.amazonaws.com/${props.auth.userPool.userPoolId}`;
    const webAuthorizer = new authorizers.HttpJwtAuthorizer(
      "WebJwtAuthorizer",
      issuer,
      { jwtAudience: [props.auth.webClient.userPoolClientId] },
    );
    const mcpAuthorizer = new authorizers.HttpJwtAuthorizer(
      "McpJwtAuthorizer",
      issuer,
      { jwtAudience: [props.auth.mcpClient.userPoolClientId] },
    );
    const mcpIntegration = new integrations.HttpLambdaIntegration(
      "McpIntegration",
      mcpLambda,
    );
    const webIntegration = new integrations.HttpLambdaIntegration(
      "WebIntegration",
      webLambda,
    );
    const oauthIntegration = new integrations.HttpLambdaIntegration(
      "OAuthIntegration",
      oauthLambda,
    );
    this.api.addRoutes({
      path: "/mcp",
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.GET],
      integration: mcpIntegration,
      authorizer: mcpAuthorizer,
      authorizationScopes: ["schedule-hub-mcp/use"],
    });
    for (const path of [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/mcp",
    ]) {
      this.api.addRoutes({
        path,
        methods: [apigwv2.HttpMethod.GET],
        integration: mcpIntegration,
      });
    }
    this.api.addRoutes({
      path: "/api/v1/calendar-connections/{provider}/oauth/start",
      methods: [apigwv2.HttpMethod.POST],
      integration: oauthIntegration,
      authorizer: webAuthorizer,
    });
    this.api.addRoutes({
      path: "/api/v1/calendar-connections/{connectionId}/sync-calendars",
      methods: [apigwv2.HttpMethod.POST],
      integration: oauthIntegration,
      authorizer: webAuthorizer,
    });
    this.api.addRoutes({
      path: "/api/v1/oauth/{provider}/callback",
      methods: [apigwv2.HttpMethod.GET],
      integration: oauthIntegration,
    });
    this.api.addRoutes({
      path: "/api/v1/{proxy+}",
      methods: [apigwv2.HttpMethod.ANY],
      integration: webIntegration,
      authorizer: webAuthorizer,
    });
    new CfnOutput(this, "ApiEndpoint", { value: this.api.apiEndpoint });
  }
}

interface FrontendStackProps extends StackProps {
  readonly api: apigwv2.HttpApi;
}

class FrontendStack extends Stack {
  public constructor(scope: App, props: FrontendStackProps) {
    super(scope, "Frontend", { ...props, stackName: stackName("Frontend") });
    const websiteBucket = new s3.Bucket(this, "WebsiteBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(websiteBucket),
      },
      additionalBehaviors: {
        "/api/*": {
          origin: new origins.HttpOrigin(
            `${props.api.apiId}.execute-api.${Aws.REGION}.${Aws.URL_SUFFIX}`,
          ),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy:
            cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      defaultRootObject: "index.html",
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
        },
      ],
    });
  }
}

export function createScheduleHubApp(): App {
  const app = new App();
  const data = new DataStack(app);
  const auth = new AuthStack(app);
  const api = new ApiStack(app, { table: data.table, auth });
  new FrontendStack(app, { api: api.api });
  return app;
}
