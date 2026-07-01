# x-game AWS 部署指南

使用 **AWS SAM** 将整个 x-game 应用部署到 AWS:
- **后端**: Hono + tRPC + Better-Auth → AWS Lambda (Node 20 ESM),HTTP API v2 触发
- **数据库**: Aurora Serverless v2 PostgreSQL (私有子网)
- **前端**: Vite 静态产物 → S3 (OAC 私有) + CloudFront HTTPS 分发
- **入口**: **仅 CloudFront 一个对外口子**。HTTP API v2 私有化,经 CloudFront VPC Origin + PrivateLink 接入。直接 `curl execute-api` 会被 ResourcePolicy 拒绝(403)。

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
       │                                  │  │  HTTP API v2 │ │Aurora│ │  │
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
4. Lambda 通过 VPC 内网连 Aurora;Secrets/ECR/Logs 经 NAT 出公网

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
2. `sam deploy` — 创建/更新 CloudFormation 栈,约 5–15 分钟(Aurora 启动较慢 + VPC Origin / Interface Endpoint 初次配置)
3. 读取 Outputs 拿到 WebBucket / CloudFront ID / **WebUrl** (CloudFront 域名,唯一公网入口)
4. `VITE_SERVER_URL=<WebUrl> pnpm --filter web build` → `aws s3 sync` → `cloudfront create-invalidation`

### 首次部署注意事项

- 部署脚本**不会**自动执行 Drizzle migration,因为数据库在私有子网、本机无法直连。
  - 方案 A: 通过 SSM Session Manager 端口转发(详见脚本末尾提示)
  - 方案 B: ~~临时把 Aurora 改成 `PubliclyAccessible`~~ 不再推荐 — 现在整个 API 也私有化了,即便 Aurora 临时公开,前端请求也只能走 CF,迁移仍要走 SSM
  - 方案 C: 在 Lambda 启动钩子里执行 migration(需额外代码)

### 常用命令

```bash
sam build                                # 仅构建
sam deploy --config-env dev              # 使用 dev 配置部署
sam logs -n ServerFunction --tail        # 实时查看 Lambda 日志
aws cloudformation delete-stack --stack-name x-game-dev   # 删除整个栈
```

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
| 数据库 | Aurora Serverless v2 | 自动启停,按 ACU 计费,小流量成本几乎为 0 |
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

- **部署卡在 `CREATE_IN_PROGRESS`**:Aurora Serverless v2 首次冷启 5–10 分钟属正常,等待即可
- **`/trpc/*` 或 `/api/*` 返回 504**:`ApiVpcOrigin.Status` 未到 `Deployed` 或 `ExecuteApiVpcE.State` 不是 `available`。`aws cloudfront get-vpc-origin --id <id>` 与 `aws ec2 describe-vpc-endpoints` 确认。
- **`BETTER_AUTH_URL` 不匹配**:确认 `template.yaml` 的 `BETTER_AUTH_URL` 与 `CORS_ORIGIN` 都指向 `https://${WebDistribution.DomainName}`,浏览器实际访问的 origin 必须与此一致。DevTools Network → 看 `Set-Cookie` 的 Domain 是不是 CF 域名。
- **直接 `curl https://<api-id>.execute-api.../trpc/foo` 拿到 403**:符合预期,私有 API 的 ResourcePolicy 仅放行 CloudFront 服务主体。说明私有化生效。
- **CF 日志看到 `AccessDenied`**:私有 API 的 Policy 没生效,确认 `HttpApi.Policy` JSON 部署成功,`cloudfront.amazonaws.com` 在 Allow 列表,且 `AWS:SourceAccount` 与部署账号一致。
- **CORS 错误**:浏览器侧跨域只会发生在直接调 execute-api 时(应被 403 拦掉);CF 路径下是同源,不需要 CORS。仍报 CORS 错说明流量绕过了 CF,检查前端 `VITE_SERVER_URL` 是否被指向了 execute-api 域名。
- **`SecretArn` 解析失败**:确认 `BETTER_AUTH_SECRET` 参数 ≥ 32 字符
- **`sam build` 报 `pnpm: command not found`**:Makefile builder 默认不启用 container,需要本地先安装 pnpm