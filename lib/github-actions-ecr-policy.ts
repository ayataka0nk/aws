import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cdk from "aws-cdk-lib";

export class GithubActionsEcrPolicy extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);
    const ecrPushPolicy = new iam.Policy(this, "PushPolicy", {
      statements: [
        new iam.PolicyStatement({
          actions: ["ecr:GetAuthorizationToken"],
          resources: ["*"],
        }),
        new iam.PolicyStatement({
          actions: [
            "ecr:CompleteLayerUpload",
            "ecr:UploadLayerPart",
            "ecr:InitiateLayerUpload",
            "ecr:BatchCheckLayerAvailability",
            "ecr:PutImage",
          ],
          resources: ["*"],
        }),
      ],
    });

    const githubActionsUser = new iam.User(this, "User", {
      userName: "github-actions",
    });
    githubActionsUser.attachInlinePolicy(ecrPushPolicy);

    const githubActionsAccessKey = new iam.AccessKey(
      this,
      "GithubActionsAccessKey",
      {
        user: githubActionsUser,
      }
    );

    const secret = new cdk.aws_secretsmanager.Secret(
      this,
      "GithubActionSecret",
      {
        secretStringValue: githubActionsAccessKey.secretAccessKey,
      }
    );
  }
}
