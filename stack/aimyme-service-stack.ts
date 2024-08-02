import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as elb from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";

import * as ecr from "aws-cdk-lib/aws-ecr";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";
import * as codepipeline_actions from "aws-cdk-lib/aws-codepipeline-actions";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";

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
    // ECR
    ///////////////
    const ecrRepository = new ecr.Repository(this, "AimymeEcr", {
      repositoryName: "aimyme",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });

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

    // タスクがECRからイメージをpullできるようにする
    taskDefinition.addToExecutionRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
        ],
        resources: ["*"],
      })
    );

    const secret = secretsmanager.Secret.fromSecretNameV2(
      this,
      "AImyMeProdSecret",
      "aimyme/prod"
    );

    const logGroup = new logs.LogGroup(this, "ServiceLogGroup", {
      logGroupName: "/ecs/aimyme",
      retention: logs.RetentionDays.ONE_WEEK,
    });
    const container = taskDefinition.addContainer("AImyMeContainer", {
      // ダミーイメージで作成。後段のPipeLineで正しいECRから取得する。
      image: ecs.ContainerImage.fromRegistry("amazon/amazon-ecs-sample"),
      secrets: {
        DATABASE_URL: ecs.Secret.fromSecretsManager(secret, "DATABASE_URL"),
        OPENAI_API_KEY: ecs.Secret.fromSecretsManager(secret, "OPENAI_API_KEY"),
      },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "aimyme",
        logGroup: logGroup,
      }),
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
    // Pipeline
    ///////////////
    // これDockerfileをビルドしてpushするだけなら全プロジェクト共通だからさすがに共通化してよいのでは…？

    const githubSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      "GitHubToken",
      "github"
    );

    const githubAccessToken = githubSecret.secretValueFromJson("ACCESS_TOKEN");

    const pipeline = new codepipeline.Pipeline(this, "AimymePipeline");

    ///////////////
    // Source Stage
    ///////////////
    const sourceOutput = new codepipeline.Artifact();
    const sourceAction = new codepipeline_actions.GitHubSourceAction({
      actionName: "GitHub_Source",
      owner: "ayataka0nk",
      repo: "aimyme",
      branch: "main",
      oauthToken: githubAccessToken,
      output: sourceOutput,
    });
    pipeline.addStage({
      stageName: "Source",
      actions: [sourceAction],
    });

    ///////////////
    // Build Stage
    // Dockerなら共通だから、共通化できそう？
    // でもmigrationの仕方は違うパターンもありそう。例えばLaravelなら共通のイメージでマイグレーションも走らせるだろうし。
    // でも違うイメージで走らせるで統一したほうが、センスは良さそう。
    ///////////////

    const buildProject = new codebuild.PipelineProject(this, "AimymeBuild", {
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        privileged: true,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: "0.2",
        phases: {
          pre_build: {
            commands: [
              "echo Logging in to Amazon ECR...",
              "aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com",
            ],
          },
          build: {
            commands: [
              "echo Build started on `date`",
              "echo Building the Docker image...",
              "docker build --target production -t $ECR_REPO_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION .",
            ],
          },
          post_build: {
            commands: [
              "echo Build completed on `date`",
              "echo Pushing the Docker image...",
              "docker push $ECR_REPO_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION",
              // ECSデプロイのためのimagedefinitions.jsonを出力
              'echo \'[{"name":"\'$CONTAINER_NAME\'","imageUri":"\'$ECR_REPO_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION\'"}]\' > imagedefinitions.json',
            ],
          },
        },
        env: {
          variables: {
            ACCOUNT_ID: cdk.Stack.of(this).account,
            AWS_DEFAULT_REGION: cdk.Stack.of(this).region,
            ECR_REPO_URI: ecrRepository.repositoryUri,
            CONTAINER_NAME: container.containerName,
          },
        },
        artifacts: {
          files: ["imagedefinitions.json"],
        },
      }),
    });
    const buildOutput = new codepipeline.Artifact();
    const buildAction = new codepipeline_actions.CodeBuildAction({
      actionName: "Build",
      project: buildProject,
      input: sourceOutput,
      outputs: [buildOutput],
    });
    pipeline.addStage({
      stageName: "Build",
      actions: [buildAction],
    });
    ecrRepository.grantPullPush(buildProject);

    ///////////////
    // Deploy Stage
    ///////////////
    const deployAction = new codepipeline_actions.EcsDeployAction({
      actionName: "DeployToECS",
      service: service,
      imageFile: buildOutput.atPath("imagedefinitions.json"),
    });
    pipeline.addStage({
      stageName: "Deploy",
      actions: [deployAction],
    });

    // CodePipelineにECSデプロイの権限を付与
    const pipelineRole = pipeline.role;
    pipelineRole.addManagedPolicy(
      // https://docs.aws.amazon.com/ja_jp/aws-managed-policy/latest/reference/AWSCodePipeline_FullAccess.html
      iam.ManagedPolicy.fromAwsManagedPolicyName("AWSCodePipeline_FullAccess")
    );
  }
}
