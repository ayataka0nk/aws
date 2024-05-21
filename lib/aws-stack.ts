import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";

export class AwsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    // const vpc = new ec2.Vpc(this, "SampleVpca", {
    //   vpcName: "sample-vpc-changed",
    //   ipAddresses: ec2.IpAddresses.cidr("172.16.0.0/16"),
    //   subnetConfiguration: [],
    //   natGateways: 0
    // });
    // The code that defines your stack goes here

    // example resource
    // const queue = new sqs.Queue(this, 'AwsQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // });
  }
}
