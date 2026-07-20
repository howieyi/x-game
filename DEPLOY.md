# x-game AWS 部署指南

使用 **AWS SAM** 将整个 x-game 应用部署到 AWS:
- **后端**: Hono + tRPC + Better-Auth → AWS Lambda (Node 20 ESM),HTTP API v2 触发
- **数据库**: 标准 RDS PostgreSQL (非 Aurora,私有子网)
- **前端**: Vite 静态产物 → S3 (OAC 私有) + CloudFront HTTPS 分发
- **入口**: **仅 CloudFront 一个对外口子**。HTTP API v2 私有化,经 CloudFront VPC Origin + PrivateLink 接入。直接 `curl execute-api` 会被 ResourcePolicy 拒绝(403)。
- **自定义域名**: `games.inxyu.cn` → Cloudflare DNS-only CNAME → CloudFront；TLS 由 us-east-1 ACM 证书终止。

## 架构图

```
                              ┌──────────────────────────────────────┐
                              │   CloudFront (HTTPS, ONLY public)    │
                              │   *.cloudfront.net                   │
                              │   /*          /trpc/*   /api/*       │
                              └──────┬──────────────┬────────────────┘
                                     │              │
                       ┌─────────────▼────┐  ┌──────▼─────────────┐
                       │ S3 Web Bucket    │  │ VPC Origin (TLS)   │
                       │ private + OAC    │  │ (PrivateLink)      │
                       └──────────────────┘  └──────┬─────────────┘
                                                    │ ExecuteApi VPCE
                                                    ▼
       ┌──────────────────────────────────────────────────────────────────┐
       │                          VPC (10.0.0.0/16)                       │
       │                                                                  │
       │   ┌─────────────────┐  NAT GW    ┌────────────────────────────┐  │
       │   │ Public Subnets  │◄──────────►│     Private Subnets        │  │
       │   │  (2 AZs)        │            │        (2 AZs)             │  │
       │   └─────────────────┘            │  ┌──────────────┐ ┌──────┐ │  │
       │                                  │  │  HTTP API v2 │ │ RDS  │ │  │
       │                                  │  │  (PRIVATE,   │ │  v2  │ │  │
       │                                  │  │   Resource-  │ │      │ │  │
       │                                  │  │   Policy)    │ │      │ │  │
       │                                  │  └──────┬───────┘ └──────┘ │  │
       │                                  │         │ VPC integration  │  │
       │                                  │  ┌──────▼───────────────┐  │  │
       │                                  │  │ Lambda (Hono)        │  │  │
       │                                  │  └──────────────────────┘  │  │
       │                                  └────────────────────────────┘  │
       └──────────────────────────────────────────────────────────────────┘
```

流量路径:
1. 浏览器 → `https://<cloudfront>/...`
2. CF 按路径分发:`/` → S3、`/trpc/*` 与 `/api/*` → VPC Origin
3. VPC Origin 经 PrivateLink 走 AWS 内网到 ExecuteApi VPCE → 私有 HTTP API → Lambda
4. Lambda 通过 VPC 内网连数据库;Secrets/ECR/Logs 经 NAT 出公网

## 一次性准备

1. **安装依赖**
   ```bash
   brew install awscli sam
   pnpm install
   ```

2. **配置 AWS 凭证**
   ```bash
   aws configure   # 输入 Access Key、Secret、Region(建议 us-east-1)
   aws sts get-caller-identity   # 验证
   ```
   账号需要以下权限(可在 IAM Policy 中授权):
   - `CloudFormation:*`、`Lambda:*`、`S3:*`、`CloudFront:*`
   - `EC2:*`(VPC / Subnet / SG / NAT)
   - `RDS:*`、`SecretsManager:GetSecretValue`
   - `IAM:*`(创建角色)

3. **生成 Better-Auth 密钥**
   ```bash
   openssl rand -base64 48
   ```

4. **复制环境变量模板**
   ```bash
   cp .env.example .env
   # 编辑 .env,填入 AWS_REGION、BETTER_AUTH_SECRET 等
   ```

## 部署

```bash
./scripts/deploy.sh              # 默认 dev 阶段
./scripts/deploy.sh staging      # staging
./scripts/deploy.sh prod         # 生产(会自动开启 DeletionProtection)
```

脚本会依次执行:
1. `sam build` — 通过 `apps/server/Makefile` 触发 `pnpm install` + `pnpm --filter server build`,把 `dist/lambda.mjs` 打入 artifact
2. `sam deploy` — 创建/更新 CloudFormation 栈,约 5–15 分钟(RDS 首次创建较慢 + VPC Origin / Interface Endpoint 初次配置)
3. 读取 Outputs 拿到 WebBucket / CloudFront ID / **WebUrl** (CloudFront 域名,唯一公网入口)
4. `VITE_SERVER_URL=<WebUrl> pnpm --filter web build` → `aws s3 sync` → `cloudfront create-invalidation`

### 首次部署注意事项

- 数据库 schema 由 Lambda cold-start 自动应用 — [apps/server/src/lambda.ts](apps/server/src/lambda.ts) 在第一次请求前调用 `drizzle-orm/node-postgres/migrator` 的 `migrate()`,并发冷启动由 pg advisory lock 串行化,不需要任何手动步骤、不需要 SSM 隧道。
- 修改 schema 后:本地跑 `pnpm db:generate` 生成 SQL,然后和代码一并提交;下一次 `sam deploy` 会带着新 SQL 自动 apply。
- 迁移失败的可见性:CloudWatch Logs 的 Lambda 日志里查找 `[migrate]` 前缀;失败的迁移不会阻塞后续冷启动再试一次。

### 常用命令

```bash
sam build                                # 仅构建
sam deploy --config-env dev              # 使用 dev 配置部署
sam logs -n ServerFunction --tail        # 实时查看 Lambda 日志
aws cloudformation delete-stack --stack-name x-game-dev   # 删除整个栈
```

## CI 部署(`.github/workflows/deploy-dev.yml`)

push 到 `main` 自动部署到 dev 阶段(可手动 `workflow_dispatch` 触发)。流程:

1. `pnpm install --frozen-lockfile`
2. `pnpm db:check` — schema/migration drift 守门
3. `sam build` — 编译 + 校验 artifact 完整性(检查 `factory-*.mjs` 等 tsdown chunks 是否齐全)
4. 配置 OIDC 凭证,assume `x-game-deploy-gha` role
5. `./scripts/deploy.sh dev --no-confirm`
6. Smoke test:`curl <WebUrl>/api/auth/get-session`,期望 2xx/4xx,不能 5xx 或 504
7. 抓 Lambda 最近 2 分钟的 `[migrate]` / Error 日志贴到 workflow 输出
8. 失败时自动开 issue,链到 CFN stack events

### 一次性 OIDC bootstrap(每个 AWS account 一次)

```bash
# 建 GitHub OIDC provider(幂等)
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 \
  2>/dev/null || true

# 建 GHA role,挂同一份 deploy-policy
cd infra/iam
sed -e 's/ACCOUNT_ID/775086395318/g' \
    -e 's|OWNER/REPO|yue3694/x-game|g' \
    github-oidc-trust-policy.json > /tmp/trust-gha.json

aws iam create-role \
  --role-name x-game-deploy-gha \
  --assume-role-policy-document file:///tmp/trust-gha.json

aws iam put-role-policy \
  --role-name x-game-deploy-gha \
  --policy-name x-game-deploy-policy \
  --policy-document file://deploy-policy.json
```

### GitHub repo 配 secrets/vars

| 类型 | 名字 | 值 |
|---|---|---|
| Secret | `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::775086395318:role/x-game-deploy-gha` |
| Secret | `BETTER_AUTH_SECRET` | `openssl rand -base64 48` |
| Variable | `AWS_REGION` | `us-east-1` |

```bash
gh secret set AWS_DEPLOY_ROLE_ARN --body "arn:aws:iam::775086395318:role/x-game-deploy-gha"
gh secret set BETTER_AUTH_SECRET --body "$(openssl rand -base64 48)"
gh variable set AWS_REGION --body "us-east-1"
```

GitHub Environment `dev` 配可选:Settings → Environments → dev → Required reviewers(发 PR 后合并前 review 才触发)。

## 已修改/新增的文件

```
x-game/
├── template.yaml              ← SAM 主模板
├── samconfig.toml             ← SAM CLI 多阶段配置
├── .env.example               ← 部署用环境变量
├── scripts/
│   └── deploy.sh              ← 一键部署脚本
├── DEPLOY.md                  ← 本文档
└── apps/server/
    ├── Makefile               ← SAM 自定义构建器
    ├── tsdown.config.ts       ← 改:构建 index + lambda 两个产物
    ├── package.json           ← 加 build:lambda 脚本
    └── src/
        ├── app.ts             ← 新:从 index.ts 抽出的 Hono 应用
        ├── index.ts           ← 改:仅 dev 入口,委托给 app.ts
        └── lambda.ts          ← 新:Lambda handler(hono/aws-lambda)
```

## 关键决策与权衡

| 决策 | 选择 | 原因 |
|------|------|------|
| 函数运行时 | nodejs20.x (ESM) | Node 20 原生支持 ESM Lambda,与项目 `"type":"module"` 一致 |
| Lambda 打包 | 单文件 bundle (noExternal: /.+/) | 避免 pnpm workspace 软链问题,artifact < 10MB |
| 适配器 | hono/aws-lambda | 改动最小,流式响应,与现有 `@hono/node-server` dev 路径并行 |
| 触发器 | HTTP API v2 + CloudFront VPC Origin | 私有 API 经 PrivateLink,CF 是唯一对外口子;浏览器请求统一从 CF 域名出 |
| 数据库 | 标准 RDS PostgreSQL (非 Aurora, `DbInstanceClass`) | 该 AWS 账号对 Aurora **集群本身**有"账号计划"限制(CREATE_FAILED,与 Serverless/Provisioned 无关),改用非 Aurora 的单实例 RDS 彻底规避 |
| 密码管理 | RDS `ManageMasterUserPassword` | 自动写入 Secrets Manager,动态引用解析 |
| CORS | 双向注入 | CloudFront 域名 → Lambda `CORS_ORIGIN`,HTTP API 允许该源 |
| 静态托管 | S3 + CloudFront + OAC | 比 Amplify / S3-static-website 便宜,SPA 友好 |

## 升级 / 优化方向(可选)

1. **RDS Proxy**:Lambda 突发场景下避免连接风暴;加 Proxy 后,DATABASE_URL 改为 Proxy 端点
2. **自定义域名**:HTTP API 加 `DomainName` + ACM 证书;CloudFront 加 Alternate Domain Name
3. **WAF**:在 CloudFront 前挂 WebACL,防滥用
4. **CI/CD**:用 GitHub Actions 调 `sam deploy`,BETTER_AUTH_SECRET 来自 GitHub Secrets
5. **冷启动优化**:Lambda Web Adapter + 预置并发;或改用容器镜像 (ECR)
6. **日志聚合**:CloudWatch Logs → Firehose → S3,启用结构化日志
7. **GA**:接入 CloudWatch RUM / Sentry 之类的前后端观测
8. **NAT 优化**:加 Interface Endpoints (Secrets Manager / ECR api+dkr / CloudWatch Logs),NAT 改成兜底;验证稳定后再删 NAT,省 ~$32/月 + 数据传输费

## 故障排查

- **部署卡在 `CREATE_IN_PROGRESS`**:RDS 实例首次创建 5–10 分钟属正常,等待即可
- **`AuroraCluster CREATE_FAILED: ... free plan accounts ... WithExpressConfiguration`**:该 AWS 账号对 **Aurora 集群**(`AWS::RDS::DBCluster`)本身有账号计划限制,无论 Serverless 还是 Provisioned 实例都会失败,需联系 AWS Support 或升级账号才能使用 Aurora。本模板已改用标准 RDS(`AWS::RDS::DBInstance`,`DbInstanceClass` 参数)彻底规避这个限制
- **`/trpc/*` 或 `/api/*` 返回 504**:`ApiVpcOrigin.Status` 未到 `Deployed` 或 `ExecuteApiVpcE.State` 不是 `available`。`aws cloudfront get-vpc-origin --id <id>` 与 `aws ec2 describe-vpc-endpoints` 确认。
- **`BETTER_AUTH_URL` 不匹配**:确认 `template.yaml` 的 `BETTER_AUTH_URL` 与 `CORS_ORIGIN` 都指向 `https://${WebDistribution.DomainName}`,浏览器实际访问的 origin 必须与此一致。DevTools Network → 看 `Set-Cookie` 的 Domain 是不是 CF 域名。
- **直接 `curl https://<api-id>.execute-api.../trpc/foo` 拿到 403**:符合预期,私有 API 的 ResourcePolicy 仅放行 CloudFront 服务主体。说明私有化生效。
- **CF 日志看到 `AccessDenied`**:私有 API 的 Policy 没生效,确认 `HttpApi.Policy` JSON 部署成功,`cloudfront.amazonaws.com` 在 Allow 列表,且 `AWS:SourceAccount` 与部署账号一致。
- **CORS 错误**:浏览器侧跨域只会发生在直接调 execute-api 时(应被 403 拦掉);CF 路径下是同源,不需要 CORS。仍报 CORS 错说明流量绕过了 CF,检查前端 `VITE_SERVER_URL` 是否被指向了 execute-api 域名。
- **`SecretArn` 解析失败**:确认 `BETTER_AUTH_SECRET` 参数 ≥ 32 字符
- **`sam build` 报 `pnpm: command not found`**:Makefile builder 默认不启用 container,需要本地先安装 pnpm

## 行为埋点与飞书告警

行为事件通过 `POST /api/analytics/events` 批量写入独立的
`behavior_event` 表。Lambda 冷启动时会自动应用对应 migration。

飞书异常通知是可选能力，在 `.env` 中配置：

```bash
FEISHU_ANALYTICS_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/...
```

留空时只保存埋点，不发送通知。已登录用户产生的异常事件会沿用项目的
`SNS → SQS → Worker → DLQ` 链路发送飞书；Webhook 调用失败会由 SQS
自动重试，超过 5 次后进入死信队列，并触发已有的 DLQ 告警。只有飞书明确
返回成功后，事件才会写入 `alerted_at`。

为避免公开埋点接口被滥用，匿名事件仅参与统计，不触发外部 Webhook；接口
同时按来源 IP 限速，`signup`、`first_play` 等服务端事件禁止由浏览器提交。
当前异常规则包括：

- 前端 `window.error` 和未处理 Promise 拒绝；
- LCP 大于 4000ms；
- CLS 大于 0.25；
- INP 大于 500ms。

Webhook 属于敏感凭证，不得写入代码、提交到 Git 或输出到 CI 日志。

## MCP 管理令牌

部署模板会自动创建并生成 MCP Bearer Token，不需要把 Token 放进 `.env` 或
`samconfig.toml`。部署后先读取 Stack Output `McpTokenSecretArn`，再按 ARN
从 Secrets Manager 获取真实值。生产环境不注册通用 SQL 工具；专用行为统计、
排行榜和日志工具不受影响。
