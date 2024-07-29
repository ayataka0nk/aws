import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elb from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Construct } from "constructs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as certificatemanager from "aws-cdk-lib/aws-certificatemanager";

/**
 * 共通ALBスタック
 * コスト削減のため共通のALBを使用する
 */
export class CommonAlbStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    vpc: ec2.Vpc,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);
    const domainName = "ayataka0nk.com";
    const securityGroup = new ec2.SecurityGroup(this, "SecurityGroup", {
      vpc: vpc,
      description: "Security Group for ALB",
      allowAllOutbound: true,
    });

    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "Allow HTTP traffic"
    );

    const hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
      domainName: domainName,
    });
    const certificate = new certificatemanager.Certificate(
      this,
      "Certificate",
      {
        domainName: domainName,
        subjectAlternativeNames: ["*." + domainName],
        validation:
          certificatemanager.CertificateValidation.fromDns(hostedZone),
      }
    );

    const alb = new elb.ApplicationLoadBalancer(this, "Alb", {
      vpc: vpc,
      internetFacing: true,
      securityGroup: securityGroup,
    });

    const listener = alb.addListener("Listener", {
      port: 80,
      open: true,
    });

    listener.addAction("DefaultAction", {
      action: elb.ListenerAction.redirect({
        protocol: "HTTPS",
        port: "443",
        permanent: true,
      }),
    });
    const httpsListener = alb.addListener("HttpsListener", {
      port: 443,
      open: true,
    });
    httpsListener.addCertificates("Certificate", [certificate]);

    httpsListener.addAction("HttpsDefaultAction", {
      action: elb.ListenerAction.fixedResponse(404, {
        contentType: "text/plain",
        messageBody: "Not Found",
      }),
    });

    new cdk.CfnOutput(this, "CommonAlbArn", {
      value: alb.loadBalancerArn,
      exportName: "CommonAlbArn",
    });
    new cdk.CfnOutput(this, "CommonAlbSecurityGroupId", {
      value: securityGroup.securityGroupId,
      exportName: "CommonAlbSecurityGroupId",
    });
    new cdk.CfnOutput(this, "CommonAlbHttpListenerArn", {
      value: listener.listenerArn,
      exportName: "CommonAlbHttpListenerArn",
    });

    new cdk.CfnOutput(this, "CommonAlbHttpsListenerArn", {
      value: httpsListener.listenerArn,
      exportName: "CommonAlbHttpsListenerArn",
    });

    new cdk.CfnOutput(this, "CommonAlbDnsName", {
      value: alb.loadBalancerDnsName,
      exportName: "CommonAlbDnsName",
    });
    new cdk.CfnOutput(this, "CommonAlbCanonicalHostedZoneId", {
      value: alb.loadBalancerCanonicalHostedZoneId,
      exportName: "CommonAlbCanonicalHostedZoneId",
    });
  }
}
