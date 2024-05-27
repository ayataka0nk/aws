import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as route53 from "aws-cdk-lib/aws-route53";
import { ApplicationLoadBalancer } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as certificatemanager from "aws-cdk-lib/aws-certificatemanager";

interface AwsStackProps extends cdk.StackProps {
  certificate: certificatemanager.Certificate;
}
export class AwsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AwsStackProps) {
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

    ///////////////
    // ECS
    ///////////////
    const cluster = new ecs.Cluster(this, "ClockworkCluster", {
      clusterName: `ClockworkCluster`,
      vpc: vpc,
    });

    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      "ClockworkTaskDefinition",
      {
        cpu: 1024,
        memoryLimitMiB: 2048,
      }
    );

    const container = taskDefinition.addContainer("ClockworkContainer", {
      image: ecs.ContainerImage.fromEcrRepository(
        ecrRepository,
        "0c272af55c7700fae62b3d9cfdc8e7efeca14980"
      ),
      //TODO タグをパラメータストアから取得する
    });
    container.addPortMappings({
      containerPort: 3000,
      protocol: ecs.Protocol.TCP,
    });
    const ecsSericeSecurityGroup = new ec2.SecurityGroup(
      this,
      "EcsServiceSecurityGroup",
      {
        vpc: vpc,
        description: "Security Group for ECS Service",
        allowAllOutbound: true,
      }
    );
    const service = new ecs.FargateService(this, "ClockworkService", {
      cluster: cluster,
      taskDefinition: taskDefinition,
      securityGroups: [ecsSericeSecurityGroup],
      capacityProviderStrategies: [
        {
          capacityProvider: "FARGATE_SPOT",
          base: 1,
          weight: 1,
        },
      ],
      // ECSからネットに接続するため。
      // ただしIngressルールをAnyIPにせず縛る
      assignPublicIp: true,
    });

    ///////////////
    // ALB
    ///////////////
    const albSecurityGroup = new ec2.SecurityGroup(this, "AlbSecurityGroup", {
      vpc: vpc,
      description: "Security Group for ALB",
      allowAllOutbound: true,
    });
    albSecurityGroup.addIngressRule(
      ec2.Peer.prefixList("pl-58a04531"),
      ec2.Port.tcp(80),
      "Allow HTTP traffic"
    );
    ecsSericeSecurityGroup.addIngressRule(
      albSecurityGroup,
      ec2.Port.tcp(3000),
      "Allow HTTP traffic"
    );
    const alb = new ApplicationLoadBalancer(this, "ClorkworkLoadBalancer", {
      vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
    });
    const listener = alb.addListener("Listener", {
      port: 80,
      open: true,
    });
    listener.addTargets("EcsService", {
      port: 80,
      targets: [service],
    });

    ///////////////
    // Cloudfront
    ///////////////
    const distribution = new cloudfront.CloudFrontWebDistribution(
      this,
      "WebsiteDistribution",
      {
        viewerCertificate: cloudfront.ViewerCertificate.fromAcmCertificate(
          props.certificate,
          {
            aliases: ["clockwork.ayataka0nk.com"],
          }
        ),
        priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
        originConfigs: [
          {
            customOriginSource: {
              domainName: alb.loadBalancerDnsName,
              originProtocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            },
            behaviors: [
              {
                isDefaultBehavior: true,
              },
            ],
          },
        ],
      }
    );

    ///////////////
    // Route53
    ///////////////
    const hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
      domainName: "ayataka0nk.com",
    });
    const aRecord = new route53.ARecord(this, "ARecord", {
      zone: hostedZone,
      recordName: "clockwork",
      target: route53.RecordTarget.fromAlias(
        new cdk.aws_route53_targets.CloudFrontTarget(distribution)
      ),
      ttl: cdk.Duration.minutes(5),
    });
  }
}
