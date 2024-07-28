import * as cdk from "aws-cdk-lib";
import * as rds from "aws-cdk-lib/aws-rds";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { Bastion } from "../lib/bastion";

/**
 * 共通永続系
 */
export class CommonPersistentStack extends cdk.Stack {
  public readonly rds: rds.DatabaseInstance;
  constructor(
    scope: Construct,
    id: string,
    vpc: ec2.Vpc,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);
    const dbSecurityGroup = new ec2.SecurityGroup(this, "SecurityGroup", {
      vpc: vpc,
      description: "Security group for RDS database",
      allowAllOutbound: false,
    });
    dbSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(5432),
      "Allow PostgreSQL access from within VPC"
    );

    // これで作成すると初期パスワードはSecret Managerに保存される。
    this.rds = new rds.DatabaseInstance(this, "Database", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_2,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MICRO
      ),
      vpc: vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      // Storage Configuration
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      storageType: rds.StorageType.GP2,
      // Upgrade Policy
      allowMajorVersionUpgrade: false,
      autoMinorVersionUpgrade: true,
      deleteAutomatedBackups: true,
      // Deletion Protection
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      //Security Group
      securityGroups: [dbSecurityGroup],
    });

    new Bastion(this, "Bastion", vpc);
  }
}
