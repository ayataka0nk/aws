import { Construct } from "constructs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as elb from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as certificatemanager from "aws-cdk-lib/aws-certificatemanager";

export class Ayataka0nk extends Construct {
  public readonly hostedZone: route53.IHostedZone;
  constructor(scope: Construct) {
    super(scope, "Ayataka0nk");
    this.hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
      domainName: "ayataka0nk.com",
    });
  }
  public createCertificate(subdomain: string) {
    return new certificatemanager.Certificate(this, subdomain, {
      domainName: `${subdomain}.ayataka0nk.com`,
      validation: certificatemanager.CertificateValidation.fromDns(
        this.hostedZone
      ),
    });
  }
  public addALbRecord(name: string, target: elb.IApplicationLoadBalancer) {
    new route53.ARecord(this, name, {
      zone: this.hostedZone,
      recordName: name,
      target: route53.RecordTarget.fromAlias(
        new targets.LoadBalancerTarget(target)
      ),
    });
  }
}
