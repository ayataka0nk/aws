import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

/**
 * 踏み台サーバー
 * 便利だし適切な抽象化がなされていると判断した。共通化して残す。
 */
export class Bastion extends Construct {
  public readonly instance: ec2.Instance;
  public readonly securityGroup: ec2.SecurityGroup;
  constructor(scope: Construct, id: string, vpc: ec2.Vpc) {
    super(scope, id);
    this.securityGroup = new ec2.SecurityGroup(this, "BastionSecurityGroup", {
      vpc: vpc,
      description: "Security Group for Bastion Host",
      allowAllOutbound: true,
    });
    this.securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      "Allow SSH access from anywhere"
    );
    this.securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443));

    this.instance = new ec2.Instance(this, "EC2", {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.NANO
      ),
      machineImage: new ec2.AmazonLinuxImage({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2023,
        cpuType: ec2.AmazonLinuxCpuType.ARM_64,
      }),
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      securityGroup: this.securityGroup,
      ssmSessionPermissions: true, // SSMによるアクセスを許可
    });
  }
}
