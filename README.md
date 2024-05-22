# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

- `npm run build` compile typescript to js
- `npm run watch` watch for changes and compile
- `npm run test` perform the jest unit tests
- `npx cdk deploy` deploy this stack to your default AWS account/region
- `npx cdk diff` compare deployed stack with current state
- `npx cdk synth` emits the synthesized CloudFormation template

## 手動で触らないこと

CIDR ブロックや Private IP アドレスを直接指定しないこと。

## ポイント

### EC2 における SSM の有効化

- CDKのEC2記述
  - 443 インバウンドポートの開放
  - ssmSessionPermissions: true
- ローカルの準備
  - SessionManagerPlugin のインストール
    - https://docs.aws.amazon.com/systems-manager/latest/userguide/install-plugin-debian-and-ubuntu.html

