import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import { GithubActionsEcrPolicy } from "../lib/github-actions-ecr-policy";

export class EcrStack extends cdk.Stack {
  public readonly aimyme: ecr.Repository;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    new GithubActionsEcrPolicy(this, "GithubActionsEcrPolicy");

    this.aimyme = new ecr.Repository(this, "AimymeEcr", {
      repositoryName: "aimyme",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });
  }
}
