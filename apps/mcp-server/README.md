# x-game MCP Server

只读的 MCP（Model Context Protocol）服务，用于查询 x-game 平台的线上数据（行为埋点、对局/排行榜、Lambda 日志、通用只读 SQL）。

## 本地启动

```bash
# 1. 在 monorepo 根目录生成一个随机令牌
openssl rand -hex 32

# 2. 将输出写入项目根目录 .env（不要提交真实令牌）
# MCP_TOKEN=粘贴上一步生成的随机令牌

# 3. 在 monorepo 根目录启动独立 MCP 服务
pnpm run dev:mcp
```

MCP 固定监听 `http://localhost:3001/mcp`，与 API 的 3000 和 Web 的
5173 端口分离。

## 验证

```bash
curl -i http://localhost:3001/mcp/healthz
# 200 {"status":"ok","service":"x-game-mcp-server"}

curl -X POST http://localhost:3001/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "Authorization: Bearer $MCP_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

执行验证命令前，可以把 `.env` 中的同一个值临时导入当前 Shell：

```bash
export MCP_TOKEN='粘贴项目 .env 中的 MCP_TOKEN'
```

用 `@modelcontextprotocol/inspector` 可视化调试时，不要把 HTTP 地址直接
放在命令末尾。未指定传输类型时，Inspector 会把末尾参数当作 STDIO
可执行命令，从而出现 `spawn http://localhost:3001/mcp ENOENT`。

```bash
npx -y @modelcontextprotocol/inspector
```

Inspector 通常会自动打开 `http://localhost:6274`。在左侧连接配置中填写：

- Transport Type：`Streamable HTTP`
- URL：`http://localhost:3001/mcp`
- Authentication / Bearer Token：填写根目录 `.env` 中的 `MCP_TOKEN`

也可以使用 CLI 模式快速验证工具列表：

```bash
export MCP_TOKEN='粘贴项目 .env 中的 MCP_TOKEN'

npx -y @modelcontextprotocol/inspector \
  --cli http://localhost:3001/mcp \
  --transport http \
  --method tools/list \
  --header "Authorization: Bearer $MCP_TOKEN"
```

## 鉴权模型

- 端点：必须 `Authorization: Bearer <MCP_TOKEN>`，常量时间比较
- token 来源：dev 用 `.env` 中的 `MCP_TOKEN`；prod 用 `MCP_TOKEN_SECRET_ARN` 从 Secrets Manager 读
- **MCP server 不做 per-user 鉴权**。生产令牌由 CloudFormation 创建的
  Secrets Manager Secret 自动生成；通过 Stack Output `McpTokenSecretArn`
  找到 ARN后再读取真实值。
- 通用 SQL 工具在生产环境固定关闭；开发环境手工开启时也只允许查询
  `behavior_event`、`game_record` 的非敏感列，禁止认证表、`SELECT *` 和参数占位符。

## 通用 SQL 工具

prod 默认禁用。打开方式：

```
MCP_ENABLE_SQL_QUERY=true
```

并走 8 层防御（HTTPS 鉴权 / READ ONLY tx / 5s statement_timeout / 白名单预解析 / 标识符白名单 / 函数黑名单 / LIMIT 注入 / 错误脱敏）。

## 部署

走与 `apps/server` 同一套 SAM 流水线（`scripts/deploy.sh`）。`template.yaml` 新增 `McpFunction` + ALB listener rule `/mcp/*` + CloudFront CacheBehavior。
