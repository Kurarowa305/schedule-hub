import { Match, Template } from "aws-cdk-lib/assertions";
import { it } from "vitest";
import { createScheduleHubApp } from "../src/app.js";

it("CloudFrontの/api/*をHTTP APIへ認証header・query付きで転送する", () => {
  const assembly = createScheduleHubApp().synth();
  const template = Template.fromJSON(
    assembly.getStackByName("ScheduleHub-main-Frontend").template,
  );

  template.hasResourceProperties("AWS::CloudFront::Distribution", {
    DistributionConfig: {
      CacheBehaviors: Match.arrayWith([
        Match.objectLike({
          PathPattern: "/api/*",
          ViewerProtocolPolicy: "redirect-to-https",
          AllowedMethods: [
            "GET",
            "HEAD",
            "OPTIONS",
            "PUT",
            "PATCH",
            "POST",
            "DELETE",
          ],
          CachePolicyId: Match.anyValue(),
          OriginRequestPolicyId: Match.anyValue(),
        }),
      ]),
      CustomErrorResponses: Match.arrayWith([
        Match.objectLike({
          ErrorCode: 403,
          ResponseCode: 200,
          ResponsePagePath: "/index.html",
        }),
      ]),
    },
  });
});
