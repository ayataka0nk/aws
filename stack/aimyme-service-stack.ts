import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as elb from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as certificatemanager from "aws-cdk-lib/aws-certificatemanager";

import * as ecr from "aws-cdk-lib/aws-ecr";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";

export class AimymeServiceStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    vpc: ec2.Vpc,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);
    const domainName = "ayataka0nk.com";
    const subDomainName = "aimyme";
    const fullDomainName = `${subDomainName}.${domainName}`;
    const hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
      domainName: domainName,
    });

    const albSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      "ALBSecurityGroup",
      cdk.Fn.importValue("CommonAlbSecurityGroupId")
    );

    const albHttpsListener =
      elb.ApplicationListener.fromApplicationListenerAttributes(
        this,
        "AlbHttpsListener",
        {
          listenerArn: cdk.Fn.importValue("CommonAlbHttpsListenerArn"),
          securityGroup: albSecurityGroup,
        }
      );
    const alb =
      elb.ApplicationLoadBalancer.fromApplicationLoadBalancerAttributes(
        this,
        "Alb",
        {
          loadBalancerArn: cdk.Fn.importValue("CommonAlbArn"),
          securityGroupId: albSecurityGroup.securityGroupId,
          loadBalancerDnsName: cdk.Fn.importValue("CommonAlbDnsName"),
          loadBalancerCanonicalHostedZoneId: cdk.Fn.importValue(
            "CommonAlbCanonicalHostedZoneId"
          ),
        }
      );

    ///////////////
    // ECS 構築
    ///////////////
    const cluster = new ecs.Cluster(this, "AImyMeCluster", {
      vpc: vpc,
    });

    // タスク定義
    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      "AImyMeTaskDefinition",
      {
        cpu: 256,
        memoryLimitMiB: 512,
      }
    );

    const secret = secretsmanager.Secret.fromSecretNameV2(
      this,
      "AImyMeProdSecret",
      "aimyme/prod"
    );

    const container = taskDefinition.addContainer("AImyMeContainer", {
      // ダミーイメージで作成。後段のPipeLineで正しいECRから取得する。
      image: ecs.ContainerImage.fromRegistry("amazon/amazon-ecs-sample"),
      secrets: {
        DATABASE_URL: ecs.Secret.fromSecretsManager(secret, "DATABASE_URL"),
        OPENAI_API_KEY: ecs.Secret.fromSecretsManager(secret, "OPENAI_API_KEY"),
      },
    });
    container.addPortMappings({
      // コンテナ内では常に80番で待ち受けるようDockerfileを書く
      containerPort: 80,
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
    ecsSericeSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "Allow HTTP traffic"
    );

    const service = new ecs.FargateService(this, "AImyMeService", {
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
      assignPublicIp: true,
    });

    /////////////////
    // ALB 接続
    /////////////////
    const albTargetGroup = new elb.ApplicationTargetGroup(
      this,
      "AimymeTargetGroup",
      {
        vpc: vpc,
        // 指定したサービスの80番ポートに流す
        port: 80,
        protocol: elb.ApplicationProtocol.HTTP,
        targets: [service],
        healthCheck: {
          path: "/",
          interval: cdk.Duration.seconds(30),
        },
      }
    );

    // HTTPSを受け付けてターゲットグループに流す
    albHttpsListener.addAction("AimymeAction", {
      priority: 1,
      conditions: [elb.ListenerCondition.hostHeaders([fullDomainName])],
      action: elb.ListenerAction.forward([albTargetGroup]),
    });

    // ドメインレコード設定
    new route53.ARecord(this, "AimymeARecord", {
      zone: hostedZone,
      recordName: "aimyme",
      target: route53.RecordTarget.fromAlias(
        new targets.LoadBalancerTarget(alb)
      ),
    });

    ///////////////
    // ECR
    ///////////////
    // const repository = new ecr.Repository(this, "AimymeEcr", {
    //   repositoryName: "aimyme",
    //   removalPolicy: cdk.RemovalPolicy.DESTROY,
    //   emptyOnDelete: true,
    // });

    ///////////////
    // Pipeline
    ///////////////

    // const githubSecret = secretsmanager.Secret.fromSecretNameV2(
    //   this,
    //   "GitHubToken",
    //   "github"
    // );

    // const githubAccessToken = githubSecret
    //   .secretValueFromJson("ACCESS_TOKEN")
    //   .unsafeUnwrap();

    // const pipeline = new codepipeline.Pipeline(this, "AimymePipeline", {
    //   pipelineName: "AimymePipeline",
    // });

    // const sourceOutput = new codepipeline.Artifact();
  }
}
