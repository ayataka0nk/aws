import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";

export class AwsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    ///////////////
    // VPC
    ///////////////
    const vpc = new ec2.Vpc(this, "DefaultVPC", {
      vpcName: "default-vpc",
      ipAddresses: ec2.IpAddresses.cidr("172.16.0.0/16"),
      maxAzs: 1, // 指定しないとデフォルト値が3なので、最大3つ作られてしまう。
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "PublicMain",
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: "PrivateMain",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
      natGateways: 0,
    });

    ///////////////
    // Security Group
    ///////////////
    const sshSecurityGroup = new ec2.SecurityGroup(this, "SSHSecurityGroup", {
      vpc: vpc,
      description: "Security Group for SSH",
      allowAllOutbound: true,
    });
    sshSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22));

    const ssmSecurityGroup = new ec2.SecurityGroup(this, "SSMSecurityGroup", {
      vpc: vpc,
      description: "Security Group for SSM",
      allowAllOutbound: true,
    });
    ssmSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443));

    ///////////////
    // EC2 踏み台
    ///////////////
    const bastion = new ec2.Instance(this, "Bastion", {
      vpc: vpc,
      instanceName: "bastion",
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.NANO
      ),
      machineImage: new ec2.AmazonLinuxImage({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2023,
        cpuType: ec2.AmazonLinuxCpuType.ARM_64,
      }),
      vpcSubnets: {
        subnetGroupName: "PublicMain",
      },
      securityGroup: sshSecurityGroup,
      ssmSessionPermissions: true, // SSMによるアクセスを許可
    });
    bastion.addSecurityGroup(ssmSecurityGroup);
  }
}
