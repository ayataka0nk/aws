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

## コマンド

```
npx cdk diff --profile ayataka0nk
npx cdk deploy --profile ayataka0nk
npx cdk destroy --profile ayataka0nk --all
```

SSMアクセス
```
aws ssm start-session --target i-0edf371a493966ca8 --profile ayataka0nk

aws ssm start-session --target i-02889977fbb64b776 --profile ayataka0nk --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters '{"host":["commonpersistentstack-databaseb269d8bb-4zixm2h3fbwl.cl3h3rpnzbvm.ap-northeast-1.rds.amazonaws.com"],"portNumber":["5432"],"localPortNumber":["15432"]}'
```

```
sudo su
```
```
aws ecr get-login-password --profile ayataka0nk | docker login --username AWS --password-stdin 710587538762.dkr.ecr.ap-northeast-1.amazonaws.com
```

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

推奨はわかるけど実際にこれ使ってる現場を見たことないから、みんなに使ってもらうの微妙そう～～
ルートレベルの設定だけSSMアクセスにして、他は通常通り個人ごとのキーペアで管理するほうが対応できる人は多そう。

### 後付けすると死ぬこと。

後からmaxAzsいじるとコンフリクト起こして勝手に死ぬので最初から2か3。


## いろいろmemo

### ssmでアクセスして、ec2-userへのsshを公開鍵限定で開放する

```
sudo su -
cd /home/ec2-user/.ssh
vi authorized_keys
```

で公開鍵を登録する。

### いろいろケチってDocker環境

```bash
dnf install docker -y

```


### docker認証

```
aws ecr get-login-password --region ap-northeast-1 --profile ayataka0nk | docker login --username AWS --password-stdin 710587538762.dkr.ecr.ap-northeast-1.amazonaws.com
```

### TODO

マイグレーションの自動実行
過去の不要になったECRのイメージの自動削除
過去の不要になったArtifactsの自動削除
