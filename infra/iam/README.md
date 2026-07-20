# x-game IAM 策略

四份 IAM policy 文件,各自职责:

> IAM 的 `*.json` 文件必须是标准 JSON，不能加入 `//`、`#` 或块注释。
> 为避免“加备注后 AWS 无法解析策略”，所有详细说明集中维护在本文。
> 修改策略后先运行 `jq empty infra/iam/*.json`，再通过 IAM Access
> Analyzer 或 CloudFormation change set 检查权限范围。

| 文件 | 用途 | 挂在哪里 |
|------|------|----------|
| `deploy-policy.json` | 全量部署权限(create/delete stack + 所有资源) | `x-game-deploy` 和 `x-game-deploy-gha` IAM role |
| `ops-readonly-policy.json` | 部署完后的 read-only + 调试/排障 | `x-game-ops` IAM role / dev user group |
| `trust-policy.json` | 限制谁能 assume `x-game-deploy` role(本地 dev, IAM user) | `x-game-deploy` IAM role |
| `github-oidc-trust-policy.json` | 限制谁能 assume `x-game-deploy-gha` role(GitHub Actions) | `x-game-deploy-gha` IAM role |

## 策略边界

- `trust-policy.json` 与 `github-oidc-trust-policy.json` 只定义谁能扮演角色，
  本身不授予 CloudFormation、S3 或 Lambda 操作权限。
- `deploy-policy.json` 定义角色被扮演后可以做什么，覆盖建栈、更新、回滚和
  删除，因此只能授予部署主体。
- `ops-readonly-policy.json` 面向排障人员，只应查看资源、日志和指标，不要
  为了临时修复而向其中加入写权限。
- `template.yaml` 创建的 Lambda/Synthetics execution role 属于运行时权限，
  与这里的部署者角色是不同层级，不能互相替代。

## 一次性创建 deploy role

把 `ACCOUNT_ID` 和 `USERNAME` 替换成你自己的 AWS account id 和 IAM user:

```bash
# 1. 创建 deploy role
aws iam create-role \
  --role-name x-game-deploy \
  --assume-role-policy-document "$(sed -e 's/ACCOUNT_ID/123456789012/g' -e 's/USERNAME/alice/g' trust-policy.json)"

# 2. 挂部署策略
aws iam put-role-policy \
  --role-name x-game-deploy \
  --policy-name x-game-deploy-policy \
  --policy-document file://deploy-policy.json
```

## 一次性创建 ops role / group

```bash
# 创建一个 ops group,挂只读策略
aws iam create-group --group-name x-game-ops
aws iam put-group-policy \
  --group-name x-game-ops \
  --policy-name x-game-ops-readonly \
  --policy-document file://ops-readonly-policy.json

# 把团队成员加进来
aws iam add-user-to-group --group-name x-game-ops --user-name alice
```

## 使用 deploy role 部署

```bash
# 1. assume role 拿临时凭证
aws sts assume-role \
  --role-arn arn:aws:iam::123456789012:role/x-game-deploy \
  --role-session-name x-game-deploy-session \
  --external-id x-game-deploy

# 把返回的 AccessKeyId/SecretAccessKey/SessionToken 写到 env
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...

# 2. 跑部署
BETTER_AUTH_SECRET=$(openssl rand -base64 48) ./scripts/deploy.sh dev
```

或者更简单,直接配置 `~/.aws/config` 的 profile:

```ini
[profile x-game-deploy]
role_arn = arn:aws:iam::123456789012:role/x-game-deploy
external_id = x-game-deploy
source_profile = default
region = us-east-1
```

```bash
AWS_PROFILE=x-game-deploy ./scripts/deploy.sh dev
```

## 一次性创建 GitHub Actions deploy role (OIDC)

跟 `x-game-deploy` 是分离的两个 role — 本地 dev 走 IAM user 假设(配 `AWS_PROFILE`),CI 走 OIDC(没 long-lived key)。

```bash
# 0. 创建 GitHub OIDC provider(每个 AWS account 只做一次,幂等)
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 \
  2>/dev/null || echo "OIDC provider already exists, skipping"

# 1. 创建 GHA role,信任策略限制到本 repo 的 main 分支 + 任何 tag
sed -e 's/ACCOUNT_ID/775086395318/g' \
    -e 's|OWNER/REPO|yue3694/x-game|g' \
    github-oidc-trust-policy.json > /tmp/trust-gha.json

aws iam create-role \
  --role-name x-game-deploy-gha \
  --assume-role-policy-document file:///tmp/trust-gha.json

# 2. 复用同一份 deploy-policy(权限跟本地 deploy role 完全一样)
aws iam put-role-policy \
  --role-name x-game-deploy-gha \
  --policy-name x-game-deploy-policy \
  --policy-document file://deploy-policy.json
```

GitHub repo 需要配的 secrets/vars:

| 类型 | 名字 | 用途 |
|---|---|---|
| Secret | `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::775086395318:role/x-game-deploy-gha` |
| Secret | `BETTER_AUTH_SECRET` | 至少 32 字符,base64 即可(`openssl rand -base64 48`) |
| Variable | `AWS_REGION` | 比如 `us-east-1` |

```bash
gh secret set AWS_DEPLOY_ROLE_ARN --body "arn:aws:iam::775086395318:role/x-game-deploy-gha"
gh secret set BETTER_AUTH_SECRET --body "$(openssl rand -base64 48)"
gh variable set AWS_REGION --body "us-east-1"
```

CI 跑通后,本地 dev 仍然用 `AWS_PROFILE=x-game-deploy` — 两个 role 互不影响。

## 最小权限矩阵

| Action | 为什么 |
|--------|--------|
| `cloudformation:*` | SAM 全部 stack 生命周期 |
| `iam:CreateServiceLinkedRole` | CFN 创建 VPC Origin / ELB / Lambda VPC 时会自动创建 SLR |
| `iam:PassRole` | CFN 需要把 role 传给 Lambda 和 ALB |
| `rds:GenerateDBAuthToken` | deploy.sh 末尾尝试生成 IAM token(失败也无所谓,有 `\|\| true`) |
| `secretsmanager:*` | RDS `ManageMasterUserPassword: true` 自动管理 master password |
| `kms:CreateGrant` 等 | RDS 自动轮转 secret 时需要 KMS 授权 |
| `cloudfront:CreateVpcOrigin` 的 `iam:CreateServiceLinkedRole` 权限 | **VPC Origin GA 时必须**,否则 `AccessDenied` |
| `ssm:StartSession` + `ssmmessages:*` | 通过 SSM 端口转发连 Aurora 跑 `db:push` |

## region 注意事项

`kms:ViaService` 条件里硬编码了 `us-east-1`。如果部署到别的 region,需要把:
- `secretsmanager.us-east-1.amazonaws.com` → `secretsmanager.<region>.amazonaws.com`
- `logs.us-east-1.amazonaws.com` → `logs.<region>.amazonaws.com`

否则 RDS 自动管理 secret 会失败。

## 生产环境加固建议

1. **Resource 收紧到具体 ARN**(当前 `cloudfront:*` / `ec2:Describe*` 等用了 `*`)
2. **MFA required**: trust policy 里加 `"aws:MultiFactorAuthPresent": "true"`
3. **权限边界 (Permissions Boundary)**: 给 `x-game-deploy` role 加 boundary,限制最大权限
4. **CloudTrail 监控**: 监控这个 role 的所有 `DeleteStack` / `iam:Delete*` / `cloudfront:Delete*` 调用
5. **短期凭证**: CI 用 OIDC federation 而不是 long-lived access key

## 当前模板用到的所有 IAM 实体

部署 `template.yaml` 后会创建这些 IAM entity(CFN 自动):

| 资源 | 路径 |
|------|------|
| Lambda execution role | `x-game-server-${Stage}-role-XXX` (SAM auto) |
| Inline policy for `secretsmanager:GetSecretValue` | 挂在上面 role 上 |
| `AWSServiceRoleForElasticLoadBalancing` (SLR) | 自动,ELB 创建时触发 |
| `AWSServiceRoleForCloudFrontVpcOrigins` (SLR) | 自动,VPC Origin 创建时触发 |
| `AWSServiceRoleForRDS` (SLR) | 自动,如果 RDS 需要 |
| RDS master secret | `rds!cluster-x-game-aurora-${Stage}-XXX` in Secrets Manager |
