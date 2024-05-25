import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ecs from "aws-cdk-lib/aws-ecs";
export class AwsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    ///////////////
    // VPC
    ///////////////
    const vpc = new ec2.Vpc(this, "DefaultVPC", {
      vpcName: "default-vpc",
      ipAddresses: ec2.IpAddresses.cidr("172.16.0.0/16"),
      maxAzs: 2,
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
        {
          cidrMask: 24,
          name: "Rds",
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

    const bastionSecurityGroup = new ec2.SecurityGroup(
      this,
      "SSMSecurityGroup",
      {
        vpc: vpc,
        description: "Security Group for SSM",
        allowAllOutbound: true,
      }
    );
    bastionSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443));

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
    bastion.addSecurityGroup(bastionSecurityGroup);

    ///////////////
    // RDS 共通postgres
    ///////////////
    const rdsSubnetGroup = new rds.SubnetGroup(this, "RdsSubnetGroup", {
      description: "Subnet group for RDS",
      vpc: vpc,
      subnetGroupName: "RdsSubnetGroup",
      vpcSubnets: {
        subnetGroupName: "Rds",
      },
    });

    const rdsSecurityGroup = new ec2.SecurityGroup(this, "RdsSecurityGroup", {
      vpc: vpc,
      description: "Security Group for RDS",
      allowAllOutbound: true,
    });
    rdsSecurityGroup.addIngressRule(bastionSecurityGroup, ec2.Port.tcp(5432));

    const dbUser = "postgres";
    const dbName = "postgres";
    const rdsCredentials = rds.Credentials.fromGeneratedSecret(dbUser);
    const rdsInstance = new rds.DatabaseInstance(this, "PostgresInstance", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_2,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MICRO
      ),
      databaseName: dbName,
      instanceIdentifier: "common-postgres",
      vpc: vpc,
      credentials: rdsCredentials,
      securityGroups: [rdsSecurityGroup],
      subnetGroup: rdsSubnetGroup,
      storageType: rds.StorageType.GP2,
      allocatedStorage: 20,
      maxAllocatedStorage: 50,
    });

    ///////////////
    // ECR リポジトリ
    ///////////////
    const ecrRepository = new ecr.Repository(this, "EcrRepository", {
      repositoryName: "clockwork",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    ///////////////
    // GithubActionsからECRにpushするためのポリシー
    ///////////////
    const ecrPushPolicy = new iam.Policy(this, "AWSEcrPushPolicy", {
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

    const githubActionsUser = new iam.User(this, "GithubActionsUser", {
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
