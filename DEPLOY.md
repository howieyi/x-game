# x-game AWS 部署指南

使用 **AWS SAM** 将整个 x-game 应用部署到 AWS:
- **后端**: Hono + tRPC + Better-Auth → AWS Lambda (Node 20 ESM),HTTP API v2 触发
- **数据库**: Aurora Serverless v2 PostgreSQL (私有子网)
- **前端**: Vite 静态产物 → S3 (OAC 私有) + CloudFront HTTPS 分发

## 架构图

```
                              ┌──────────────────────────────────────┐
                              │           CloudFront (HTTPS)          │
                              │   *.cloudfront.net  /  SPA fallback   │
                              └──────────────┬───────────────────────┘
                                             │
                                  ┌──────────┴──────────┐
                                  ▼                     ▼
                       ┌──────────────────┐   ┌──────────────────────┐
                       │   S3 Web Bucket  │   │  HTTP API v2 (Public)│
                       │   (private+OAC)  │   │  *.execute-api...    │
                       └──────────────────┘   └──────────┬───────────┘
                                                         │ VPC integration
                                                         ▼
       ┌──────────────────────────────────────────────────────────────────┐
       │                          VPC (10.0.0.0/16)                       │
       │                                                                  │
       │   ┌─────────────────┐  NAT GW    ┌────────────────────────────┐  │
       │   │ Public Subnets  │◄──────────►│     Private Subnets        │  │
       │   │  (2 AZs)        │            │        (2 AZs)             │  │
       │   └─────────────────┘            │  ┌──────────────┐ ┌──────┐ │  │
       │                                  │  │  Lambda      │ │Aurora│ │  │
       │                                  │  │  (Hono app)  │ │  v2  │ │  │
       │                                  │  └──────────────┘ └──────┘ │  │
       │                                  └────────────────────────────┘  │
       └──────────────────────────────────────────────────────────────────┘
```

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
2. `sam deploy` — 创建/更新 CloudFormation 栈,约 5–15 分钟(Aurora 启动较慢)
3. 读取 Outputs 拿到 WebBucket / CloudFront ID
4. `pnpm --filter web build` → `aws s3 sync` → `cloudfront create-invalidation`

### 首次部署注意事项

- 部署脚本**不会**自动执行 Drizzle migration,因为数据库在私有子网、本机无法直连。
  - 方案 A: 通过 SSM Session Manager 端口转发(详见脚本末尾提示)
  - 方案 B: 临时把 Aurora 改成 PubliclyAccessible,用完后改回
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
| 触发器 | HTTP API v2 | 比 REST API 便宜 ~70%,延迟更低;无需自定义域名 |
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

## 故障排查

- **部署卡在 `CREATE_IN_PROGRESS`**:Aurora Serverless v2 首次冷启 5–10 分钟属正常,等待即可
- **`BETTER_AUTH_URL` 不匹配**:确保前端 `VITE_SERVER_URL` 指向部署输出的 `ApiEndpoint`
- **CORS 错误**:检查浏览器 Network 面板的 `Access-Control-Allow-Origin` 是否匹配前端域名
- **`SecretArn` 解析失败**:确认 `BETTER_AUTH_SECRET` 参数 ≥ 32 字符
- **`sam build` 报 `pnpm: command not found`**:Makefile builder 默认不启用 container,需要本地先安装 pnpm