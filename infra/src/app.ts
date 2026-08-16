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
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";

const stage = "main";
const stackName = (name: string) => `ScheduleHub-${stage}-${name}`;

class DataStack extends Stack {
  public constructor(scope: App, props?: StackProps) {
    super(scope, "Data", { ...props, stackName: stackName("Data") });

    const table = new dynamodb.Table(this, "ScheduleHubTable", {
      tableName: "schedule-hub-main",
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      timeToLiveAttribute: "ttl",
      removalPolicy: RemovalPolicy.RETAIN,
    });

    table.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: {
        name: "GSI1PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: { name: "GSI1SK", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
  }
}

class ApiStack extends Stack {
  public constructor(scope: App, props?: StackProps) {
    super(scope, "Api", { ...props, stackName: stackName("Api") });

    const handler = new lambda.Function(this, "ApiHandler", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromInline(
        "exports.handler = async () => ({ statusCode: 501 });",
      ),
      timeout: Duration.seconds(10),
    });

    const api = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: "schedule-hub-main",
    });

    new CfnOutput(this, "ApiEndpoint", { value: api.apiEndpoint });
    new CfnOutput(this, "ApiHandlerName", { value: handler.functionName });
  }
}

class AuthStack extends Stack {
  public constructor(scope: App, props?: StackProps) {
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

    const userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: "schedule-hub-main",
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const googleProvider = new cognito.UserPoolIdentityProviderGoogle(
      this,
      "GoogleIdentityProvider",
      {
        userPool,
        clientId: googleClientId.valueAsString,
        clientSecretValue: SecretValue.cfnParameter(googleClientSecret),
        scopes: ["openid", "email", "profile"],
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          fullname: cognito.ProviderAttribute.GOOGLE_NAME,
        },
      },
    );

    userPool.addDomain("Domain", {
      cognitoDomain: { domainPrefix: `schedule-hub-${Aws.ACCOUNT_ID}` },
    });

    const mcpScope = new cognito.ResourceServerScope({
      scopeName: "use",
      scopeDescription: "Schedule Hub MCP toolsを利用する",
    });
    const mcpResourceServer = userPool.addResourceServer("McpResourceServer", {
      identifier: "schedule-hub-mcp",
      userPoolResourceServerName: "Schedule Hub MCP",
      scopes: [mcpScope],
    });

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

    const webClient = userPool.addClient("WebClient", {
      ...commonClientOptions,
      userPoolClientName: "schedule-hub-main-web",
      oAuth: {
        ...commonClientOptions.oAuth,
        callbackUrls: [webCallbackUrl.valueAsString],
        logoutUrls: [webLogoutUrl.valueAsString],
      },
    });
    const mcpClient = userPool.addClient("McpClient", {
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

    webClient.node.addDependency(googleProvider);
    mcpClient.node.addDependency(googleProvider);
    mcpClient.node.addDependency(mcpResourceServer);

    new CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new CfnOutput(this, "WebClientId", { value: webClient.userPoolClientId });
    new CfnOutput(this, "McpClientId", { value: mcpClient.userPoolClientId });
  }
}

class FrontendStack extends Stack {
  public constructor(scope: App, props?: StackProps) {
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
      defaultRootObject: "index.html",
    });
  }
}

export function createScheduleHubApp(): App {
  const app = new App();

  new DataStack(app);
  new ApiStack(app);
  new AuthStack(app);
  new FrontendStack(app);

  return app;
}
