# MCP Server：查询线上日志与统计

> 本文档面向 x-game 平台新增的 MCP（Model Context Protocol）服务。本服务是一个独立
> 的只读后端，部署到现有 AWS SAM 基础设施之上，向 Claude Code / Codex 等 MCP 客
> 户端提供查询平台数据（行为埋点、对局与排行榜、Lambda 日志、通用只读 SQL）的
> 能力。

## 1. 背景与目标

### 1.1 背景

x-game 平台目前的所有线上数据集中在 PostgreSQL（RDS）+ CloudWatch Logs 中。业务侧
统计链路（`packages/api/src/routers/analytics.ts`、`game.ts`、`leaderboard.ts`）已
经具备完整的聚合查询；当前不存在任何 MCP server。

运维与开发协作时，"查看昨天 memory-match 的 Top 10"、"最近一小时的 error 事件"、
"某用户的最佳成绩"这类查询只能人工跑 SQL 或临时写脚本，缺乏标准化入口。

### 1.2 目标

- 新增一个 MCP server，对外暴露只读工具，让 LLM 可以查询平台数据；
- 复用现有 tRPC router 中的无状态聚合 SQL，避免重复实现；
- 部署到现有 SAM/ALB/CloudFront 架构中，不增加新的网络入口；
- 不做任何 per-user 鉴权：调用方负责把 `userId` 传进工具入参。

## 2. 用户决策（已确认）

| 决策项 | 选择 |
|---|---|
| 数据范围 | PostgreSQL（RDS）+ 可选 CloudWatch Logs |
| 运行形态 | 只走 Streamable HTTP transport，部署到线上 |
| 鉴权模型 | 调用方传 `userId`，MCP 层只做 endpoint 鉴权 |
| v0.1 工具集 | 行为埋点 + 对局/排行榜 + Lambda 日志 + 通用只读 SQL 全部包含 |

## 3. 总体架构

### 3.1 包位置

独立 workspace `apps/mcp-server`（**不并入 `apps/server`**），理由：

1. `apps/server` 的 `lambda.ts` 已经承载 Hono + tRPC 双入口，再挂 MCP 会引起中间
   件链污染；
2. MCP 需要独立的 IAM（`logs:FilterLogEvents`），与业务 Role 隔离原则相违；
3. 独立后发布节奏、依赖演进都可与 `apps/server` 解耦。

`apps/mcp-server` 是 `pnpm-workspace.yaml` 中 `apps/*` 模式下的合规位置。

### 3.2 Transport

**Streamable HTTP**（MCP SDK 1.x 标准 transport），单 endpoint 处理 POST/GET/DELETE。

- 客户端走 POST + JSON-RPC（无状态模式）；
- 服务端按请求生命周期创建 `Server` + `transport`，符合 Lambda 短进程的天然约束；
- 同时暴露 `GET /mcp/healthz` 用于人工 curl 自检与 ALB 健康检查。

### 3.3 与现有服务的关系

| 资源 | 复用策略 |
|---|---|
| DB 连接 | 直接 `import { createDb } from "@x-game/db"`，复用 RDS 凭据解析 |
| 环境变量 | 在 `packages/env/src/server.ts` 追加 MCP 专属变量 |
| tRPC | **不复用**。MCP 工具直接调 db + zod；tRPC 强绑定 `Context`，与 MCP 调用形态不兼容 |
| 聚合 SQL | 抽到 `packages/api/src/services/{analytics-aggregate,leaderboard,game}.ts`，被 tRPC router 与 MCP tools 共享 |

## 4. 目录与文件结构

```
apps/mcp-server/
├── package.json                       # @modelcontextprotocol/sdk + Drizzle + AWS CWL SDK
├── tsconfig.json                      # extends @x-game/config
├── tsdown.config.ts                   # lambda 单 entry；noExternal:全部内联
├── Makefile                           # build-McpFunction，复用 X_GAME_ROOT 模式
├── .gitignore                         # dist 排除
├── README.md                          # 本地启动 / 上线接入说明
└── src/
    ├── index.ts                       # 本地 dev 端口 3001
    ├── lambda.ts                      # Lambda handler
    ├── app.ts                         # 创建 Hono app（/mcp + /mcp/healthz）
    ├── server.ts                      # MCP Server 工厂 + 注册所有 tools
    ├── transport.ts                   # StreamableHTTPServerTransport 单例池
    ├── auth.ts                        # Bearer token 校验，常量时间比较
    ├── db.ts                          # createDb() 单例缓存
    ├── env.ts                         # MCP 专属 env schema
    └── tools/
        ├── index.ts                   # 注册所有 tools
        ├── analytics.ts               # 3 个行为埋点工具
        ├── game.ts                    # 3 个对局/排行榜工具
        ├── logs.ts                    # Lambda 日志搜索
        └── sql.ts                     # 通用只读 SQL 工具（v0.1 最后做）
```

测试：`apps/mcp-server/test/sql.test.ts`（vitest，白名单 fuzz 用例）。

文档：`docs/mcp-server-ops.md`（CloudWatch Insights 查询模板、Alarm、上线 SOP）。

## 5. 工具契约

### 5.1 行为埋点（`tools/analytics.ts`）

#### `query_behavior_overview`
- **说明**：聚合 `behavior_event` 在指定时间窗内的总事件数、独立会话/访客/错误数，
  按事件类型分布、近 7 天每日趋势、Top 路径、performance 类事件的 P75 指标。
- **入参**：`{ days?: number (1..90, default 7); eventType?: enum }`
- **底层**：`packages/api/src/services/analytics-aggregate.ts#overview()`

#### `list_recent_events`
- **说明**：按时间倒序返回最近 N 条行为事件。
- **入参**：`{ limit?: number (1..100, default 30); eventType?: enum }`
- **底层**：`services/analytics-aggregate.ts#recent()`

#### `search_errors`
- **说明**：查询 `event_type='error'` 的事件，支持 path / 时间窗 / message 子串过滤。
- **入参**：
  ```ts
  { sinceMinutes?: number (1..10080, default 60);
    pathLike?: string (max 200);
    messageLike?: string (max 200);
    limit?: number (1..50, default 20); }
  ```
- **底层**：直查 `behavior_event` + LIKE 子串（走 `escapeLike`）

### 5.2 对局与排行榜（`tools/game.ts`）

#### `get_leaderboard_top`
- **说明**：指定 gameId(+ theme) 的 Top N + 附带 caller 的 myBest/rank。
- **入参**：`{ gameId; theme?; limit?: 1..50; callerUserId? }`
- **底层**：`services/leaderboard.ts#listTop()`（精确排名 SQL）

#### `query_game_records`
- **说明**：按 userId 查对局记录，支持 game/theme/时间窗/分页。
- **入参**：`{ userId; gameId?; theme?; sinceDays?: 1..365, default 30; page?: 0..n; limit?: 1..50, default 20 }`
- **底层**：`services/game.ts#historyByUser()`

#### `get_user_best`
- **说明**：指定 userId 的最佳成绩，可按 game/theme 缩小。
- **入参**：`{ userId; gameId?; theme? }`
- **底层**：`services/game.ts#bestOf()`

### 5.3 Lambda 日志（`tools/logs.ts`）

#### `search_lambda_logs`
- **说明**：在指定 CloudWatch Log Group 内按关键字 + 时间窗过滤事件。
- **入参**：
  ```ts
  { logGroup: enum("server" | "event-worker" | "mcp-server"), default "server";
    filterPattern?: string (max 500); // 直接作为 CloudWatch filter
    sinceMinutes?: 1..1440, default 60;
    limit?: 1..100, default 50; }
  ```
- **底层**：`@aws-sdk/client-cloudwatch-logs#FilterLogEventsCommand`
- **IAM**：Role 需 `logs:FilterLogEvents` on
  `/aws/lambda/x-game-platform-server-${Stage}`、
  `/aws/lambda/x-game-event-worker-${Stage}`、
  `/aws/lambda/x-game-mcp-server-${Stage}`。

### 5.4 通用只读 SQL（`tools/sql.ts`）

> 风险最大，最后实施（参见 §10 Milestone 4）。prod 默认 disabled。

#### `sql_query`
- **说明**：针对白名单表执行任意 `SELECT`。**生产环境优先使用上面的专用工具**。
- **入参**：
  ```ts
  { sql: string (1..5000);
    params?: array<primitive> (max 50);
    rowLimit?: 1..1000, default 100; }
  ```
- **底层调用链**：见 §6.4 "通用 SQL 工具的 8 层防御"。

## 6. 鉴权与安全

### 6.1 HTTP 鉴权

- `Authorization: Bearer <MCP_TOKEN>`（仅 Bearer 一种方式，拒绝 URL query / Basic / cookie）
- 常量时间比较：`crypto.timingSafeEqual` 防基于响应时间的爆破
- token 配置：`MCP_TOKEN_SECRET_ARN` 注入 Lambda，运行时从 Secrets Manager 拉并
  **缓存一次**，不再每次都查
- dev 后备：未配 `MCP_TOKEN_SECRET_ARN` 时回退 `MCP_TOKEN` env var（来自 `.env`）

### 6.2 caller 身份传递

- `userId` 通过 MCP **工具入参**而非 HTTP header 传递（MCP 要求工具自描述）
- 调用方审计信息（`callerUserId`）独立记录：

  ```json
  {"message":"mcp.call","tool":"search_errors","callerUserId":"u_xxx","durationMs":42}
  ```

- MCP 不做任何 per-user 数据过滤；`MCP_TOKEN` 应只在 owner/admin 机器配置

### 6.3 CloudWatch Logs IAM

```yaml
- Effect: Allow
  Action:
    - logs:FilterLogEvents
    - logs:GetLogEvents
  Resource:
    - !GetAtt ServerFunctionLogGroup.Arn
    - !GetAtt EventWorkerFunctionLogGroup.Arn   # 必须显式声明，否则 !GetAtt 不可用
    - !GetAtt McpFunctionLogGroup.Arn
```

只给 `FilterLogEvents` / `GetLogEvents`，**不给** `CreateLogStream` / `PutLogEvents` /
`Delete*` / `*`。

### 6.4 通用 SQL 工具的 8 层防御

| 层 | 控制 | 失败行为 |
|---|---|---|
| 1 | HTTP Bearer token | 401 |
| 2 | `BEGIN READ ONLY` 事务 | 写操作报 `25006` |
| 3 | `SET LOCAL statement_timeout = '5s'` | 长查询被 PG kill |
| 4 | 预解析白名单（首字 `SELECT/WITH/EXPLAIN SELECT/SHOW COLUMNS FROM`） | 直接拒 |
| 5 | 标识符白名单（`behavior_event / game_record / user / session / account / verification`），**禁 schema 限定符** | 拒 |
| 6 | 函数调用黑名单（挡 `pg_read_server_files` 等） | 拒 |
| 7 | LIMIT 注入 + 硬上限 1000（未含 LIMIT 自动追加 `$N`） | 截断/拒 |
| 8 | 错误脱敏 + 审计日志（`pg` code + 简短中文 reason，不暴露原始 message） | 统一 `isError: true` |

### 6.5 错误返回

- Hono 顶层 catch：`c.json({ error: { code: "INTERNAL", message: "internal error" } }, 500)`，不带 stack
- MCP 工具失败：返回 `{ isError: true, content: [{ type: "text", text: "<reason>" }] }`，
  **不**抛
- 所有 `console.error` 前缀 `[mcp]`，便于 CloudWatch Insights 筛选

## 7. 现有代码复用

### 7.1 复用的部分

- `packages/db/src/index.ts` 的 `createDb()`：直接 import
- `packages/env/src/server.ts`：追加 MCP 变量
- `packages/db/src/schema/*` 的 Drizzle 表定义
- `apps/server/Makefile` 的 `X_GAME_ROOT` 构建模式（复制一份）

### 7.2 不复用的部分

- `apps/server` 的 Hono app：不引入 MCP 路由
- 现有 tRPC procedure：调用形态与 MCP 不兼容
- Better-Auth session：MCP 不做 user-level 鉴权

### 7.3 推荐重构：提取 services 层

`routers/analytics.ts`、`routers/leaderboard.ts`、`routers/game.ts` 中存在大量无状态
纯函数（如 5 个聚合查询、精确排名 SQL、`groupBy` + 单查 best），这些函数可平移到：

```
packages/api/src/services/analytics-aggregate.ts    # overview, recent, searchErrors
packages/api/src/services/leaderboard.ts             # listTop
packages/api/src/services/game.ts                    # historyByUser, bestOf
```

抽完后 tRPC router 改为调用 services，MCP tools 也调用 services，**两份 SQL 共享，
杜绝 drift**。

## 8. 部署形态

### 8.1 AWS SAM 变更

`template.yaml` 新增资源：

| 资源 | 类型 | 备注 |
|---|---|---|
| `McpFunction` | `AWS::Serverless::Function` | nodejs22.x, 512MB, 30s timeout |
| `McpFunctionLogGroup` | `AWS::Logs::LogGroup` | 显式声明，14 天保留 |
| `EventWorkerFunctionLogGroup` | `AWS::Logs::LogGroup` | 显式声明，让 `!GetAtt` 可用 |
| `McpTargetGroup` | `AWS::ElasticLoadBalancingV2::TargetGroup` | 健康检查 `/mcp/healthz` |
| `AlbListenerRuleMcp` | `AWS::ElasticLoadBalancingV2::ListenerRule` | `/mcp/*` 转发到新 TG |
| `McpAlbInvokePermission` | `AWS::Lambda::Permission` | ALB → McpFunction |

`McpFunction` 复用现有 `LambdaSecurityGroup` + `PrivateSubnet1/2`（共享出网）。

`WebDistribution` 追加一条 CacheBehavior：

```yaml
- PathPattern: "/mcp/*"
  TargetOriginId: ApiVpcOrigin
  AllowedMethods: ["GET","HEAD","OPTIONS","POST","DELETE"]   # 注意 DELETE
  CachePolicyId: 4135ea2d-...   # CachingDisabled
```

`template.yaml` 同时新增：

- `Parameters.McpEnabled`（default `true`，与 `Conditions: EnableMcp` 配合可全栈跳过）
- `Parameters.McpEnableSqlQuery`（default `false`，prod 默认禁用通用 SQL 工具）

### 8.2 Build

`apps/mcp-server/Makefile` 复用 `apps/server/Makefile` 的 `X_GAME_ROOT` 模式：

```makefile
build-McpFunction:
	cd $(ROOT_DIR) && pnpm install --frozen-lockfile
	cd $(ROOT_DIR) && pnpm --filter mcp-server build
	mkdir -p $(ARTIFACTS_DIR)
	cp -R $(ROOT_DIR)/apps/mcp-server/dist/. $(ARTIFACTS_DIR)/
	echo '{"type":"module","main":"lambda.mjs"}' > $(ARTIFACTS_DIR)/package.json
```

注意：**不**复制 `packages/db/src/migrations`——MCP 是只读，cold-start 不需要
`migrate()`，函数体积更小。

### 8.3 MCP client 接入

`.mcp.json`（或 `.vscode/mcp.json`）追加：

```json
{
  "x-game-mcp": {
    "type": "http",
    "url": "https://<cloudfront-domain>/mcp",
    "headers": { "Authorization": "Bearer ${env:MCP_TOKEN}" }
  }
}
```

`MCP_TOKEN` 由 owner 在本机 shell 的 `~/.zshrc` 配置，**不**入库。

## 9. 关键文件改动清单

**新增**

- `apps/mcp-server/package.json`
- `apps/mcp-server/tsconfig.json`
- `apps/mcp-server/tsdown.config.ts`
- `apps/mcp-server/Makefile`
- `apps/mcp-server/.gitignore`
- `apps/mcp-server/README.md`
- `apps/mcp-server/src/{index,lambda,app,server,transport,auth,db,env}.ts`
- `apps/mcp-server/src/tools/{index,analytics,game,logs,sql}.ts`
- `apps/mcp-server/test/sql.test.ts`
- `docs/mcp-server-ops.md`

**修改**

- `template.yaml`（新增 6 个资源、CacheBehavior、2 个 Parameter、1 个 Condition）
- `pnpm-workspace.yaml` catalog 增加：`@modelcontextprotocol/sdk` ^1.x、
  `@aws-sdk/client-cloudwatch-logs` ^3.x
- `packages/env/src/server.ts`（追加 `MCP_TOKEN_SECRET_ARN` / `MCP_LOG_GROUPS` /
  `MCP_ENABLE_SQL_QUERY`）
- `packages/api/src/routers/{analytics,game,leaderboard}.ts`（改为调用 services）
- `packages/api/src/services/{analytics-aggregate,leaderboard,game}.ts`（新建）
- `.mcp.json`（新增 `x-game-mcp` 条目）
- `turbo.json`（保持默认；`outputs` 已含 `dist/**`）

## 10. 实施分期

### Milestone 1 — 骨架可跑通（约 250 行，9 文件）

- 新建 `apps/mcp-server/{package.json,tsconfig.json,tsdown.config.ts,Makefile,.gitignore,README.md}`
- `src/{index,lambda,app,server,transport,auth,db,env}.ts`
- 本地 `pnpm --filter mcp-server dev`（端口 3001），注册 0 个工具
- 验证：
  - `curl -i http://localhost:3001/mcp/healthz` → 200
  - `curl -X POST http://localhost:3001/mcp -H 'Authorization: Bearer devtoken' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'` → `result.tools = []`

### Milestone 2 — 接入 6 个核心工具（约 600 行 + services 抽出）

- 抽 `packages/api/src/services/{analytics-aggregate,leaderboard,game}.ts`
- 实现 `tools/analytics.ts` 与 `tools/game.ts`
- 端到端：Claude Code 接 `https://<cf>/mcp` 查真实数据
- 验证：MCP Inspector 列出 6 个工具；`query_behavior_overview` 返回真实聚合

### Milestone 3 — SAM 部署 + CloudWatch 日志搜索（约 120 行 + 30 行 template.yaml）

- 实现 `tools/logs.ts`
- `template.yaml` 增 `McpFunction` 等 6 个资源
- 显式声明 `EventWorkerFunctionLogGroup`
- 验证：dev 部署后 `curl https://<cf>/mcp/healthz`；`search_lambda_logs(logGroup="server")` 能看到 server 的最近错误

### Milestone 4 — 通用 SQL 工具（约 250 行 + 100 行测试）

> **风险最高，最后做**；prod 默认 disabled。

- `tools/sql.ts` + `sql/{whitelist,readonly-tx}.ts`
- vitest 单元测试覆盖：
  - 合法 `SELECT * FROM behavior_event LIMIT 10` 通过
  - `DROP/UPDATE/INSERT` 被拒
  - 多语句（`SELECT 1; SELECT 2`）被拒
  - 表名非白名单（`pg_shadow`）被拒
  - 函数调用（`pg_read_server_files`）被拒
  - `LIMIT 999999` 被强制改写或拒

## 11. 风险与回退

| 风险 | 缓解 | 回退 |
|---|---|---|
| 冷启动延迟 4-5s | MCP client 默认 60s timeout 体感可接受 | 给 `McpFunction` 开 Provisioned Concurrency 1（约 $10/月） |
| Streamable HTTP 需要 DELETE 方法 | `CacheBehavior.AllowedMethods` 显式包含 `DELETE` | 切回 SSE（SDK 兼容） |
| 通用 SQL 工具纵深防御失效 | 8 层防御 + prod 默认 disabled | `McpEnableSqlQuery: false` |
| IAM 权限漂移 | 只最小授权，资源级 ARN | 单独 Role，与 `ServerFunction` Role 隔离 |
| 上线事故 | dev 跑通后才允许 prod；`McpEnabled: false` 可全栈跳过 | `sam deploy --parameter-overrides McpEnabled=false` |

## 12. 验证步骤

### 12.1 本地

```bash
pnpm --filter mcp-server dev
curl -i http://localhost:3001/mcp/healthz
curl -X POST http://localhost:3001/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Authorization: Bearer devtoken' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
npx -y @modelcontextprotocol/inspector http://localhost:3001/mcp
```

### 12.2 接入线上

```bash
# 在 owner shell 配置（不入库）
export MCP_TOKEN="actual-token-from-secrets-manager"
# 修改 .mcp.json，加 x-game-mcp 条目，重启 Claude Code
"查最近 24h 的 error 事件，并告诉我 memory-match 的 Top 5"
```

确认 CloudWatch Insights 中 `McpFunctionLogGroup` 有 `[mcp.call]` 结构化日志。

### 12.3 安全 fuzz

| 输入 | 期望 |
|---|---|
| `Bearer wrong` | 401 |
| 没有 Authorization 头 | 401 |
| `sql="DROP TABLE behavior_event"` | tool rejected, code 400 |
| `sql="SELECT * FROM pg_shadow"` | tool rejected, table not in whitelist |
| `sql="SELECT 1; SELECT 2"` | tool rejected, multi-statement |
| `sql="SELECT * FROM behavior_event", rowLimit=999999` | truncated / rejected (>1000) |
| `sql="UPDATE behavior_event SET ..."` | tool rejected, keyword |
| `sql="SELECT pg_read_server_files('/etc/passwd')"` | tool rejected, function call forbidden |

### 12.4 端到端延迟基线

- dev stage：冷启动一次，平均 **1.8-3.5s**；命中连接池的请求 **< 800ms**
- 监控：`Mcp5xxAlarm` + CloudWatch Insights 模板（见 `docs/mcp-server-ops.md`）

## 13. 实施顺序（7 步）

1. 建仓库骨架（`apps/mcp-server/{package.json,tsconfig.json,tsdown.config.ts,Makefile}`），本地起 `/mcp/healthz`
2. 写 env + auth + db：`packages/env` 增 3 个变量，`auth.ts` Bearer 校验，`db.ts` 单例缓存
3. 接 MCP Streamable HTTP：`server.ts` + `transport.ts` + `app.ts` 拼出无工具的 MCP endpoint
4. 抽 services + 写 analytics/game tools：从 routers 抽出 3 个 services；同时实现 6 个 MCP tools
5. template.yaml 上 SAM：`McpFunction` 等 6 个资源 + CloudFront `/mcp/*` 路由；dev 部署并 smoke test
6. CloudWatch 日志工具：`tools/logs.ts` + IAM `logs:FilterLogEvents`
7. （可选）通用 SQL 工具：`tools/sql.ts` + `sql/{whitelist,readonly-tx}.ts` + vitest；prod 默认 disable
