import {
  App,
  CfnOutput,
  Duration,
  RemovalPolicy,
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

    new cognito.UserPool(this, "UserPool", {
      userPoolName: "schedule-hub-main",
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      removalPolicy: RemovalPolicy.RETAIN,
    });
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
