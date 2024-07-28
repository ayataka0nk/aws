#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { CommonStack } from "../stack/common-stack";
import { EcrStack } from "../stack/ecr-stack";
import { CommonNetworkStack } from "../stack/common-network-stack";
import { CommonPersistentStack } from "../stack/common-persistent-stack";
import { AimymeServiceStack } from "../stack/aimyme-service-stack";
import { CommonAlbStack } from "../stack/common-alb-stack";

const envJP: cdk.Environment = {
  account: "710587538762",
  region: "ap-northeast-1",
};
// const envUS: cdk.Environment = {
//   account: "710587538762",
//   region: "us-east-1",
// };

/**
 * 構築メモ
 * コスト削減のため、RDSとALBを共通にする。業務ではRDSは別にすべき。
 * あとはサービスごとに1つだけスタックを作成する。共通化は勘所をつかめるまではあまりしないでおく。
 */

const app = new cdk.App();

const commonNetworkStack = new CommonNetworkStack(app, "CommonNetworkStack", {
  env: envJP,
});

const commonPersistentStack = new CommonPersistentStack(
  app,
  "CommonPersistentStack",
  commonNetworkStack.vpc,
  {
    env: envJP,
  }
);

const commonAlbSatck = new CommonAlbStack(
  app,
  "CommonAlbStack",
  commonNetworkStack.vpc,
  {
    env: envJP,
  }
);

const aimymeServiceStack = new AimymeServiceStack(
  app,
  "AimymeServiceStack",
  commonNetworkStack.vpc,
  {
    env: envJP,
  }
);

// const ecrStack = new EcrStack(app, "EcrStack", {
//   env: envJP,
// });
// const commonStack = new CommonStack(
//   app,
//   "CommonStack",
//   ecrStack,
//   commonNetworkStack.vpc,
//   {
//     env: envJP,
//   }
// );
