# x-game MCP Server

只读的 MCP（Model Context Protocol）服务，用于查询 x-game 平台的线上数据（行为埋点、对局/排行榜、Lambda 日志、通用只读 SQL）。

## 本地启动

```bash
# 在 monorepo 根目录的 .env 写入（MCP 是 admin 工具，不要入库）
echo 'MCP_TOKEN=devtoken123' >> ../.env

# 端口 3001，避免与 apps/server 的 3000 冲突
pnpm --filter mcp-server dev
```

## 验证

```bash
curl -i http://localhost:3001/mcp/healthz
# 200 {"status":"ok","service":"x-game-mcp-server"}

curl -X POST http://localhost:3001/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Authorization: Bearer devtoken123' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
# {"jsonrpc":"2.0","id":1,"result":{"tools":[]}}
```

用 `@modelcontextprotocol/inspector` 可视化调试：

```bash
npx -y @modelcontextprotocol/inspector http://localhost:3001/mcp
```

## 鉴权模型

- 端点：必须 `Authorization: Bearer <MCP_TOKEN>`，常量时间比较
- token 来源：dev 用 `.env` 中的 `MCP_TOKEN`；prod 用 `MCP_TOKEN_SECRET_ARN` 从 Secrets Manager 读
- **MCP server 不做 per-user 鉴权**，`userId` 走工具入参 `callerUserId`，调用方自行负责鉴权

## 通用 SQL 工具

prod 默认禁用。打开方式：

```
MCP_ENABLE_SQL_QUERY=true
```

并走 8 层防御（HTTPS 鉴权 / READ ONLY tx / 5s statement_timeout / 白名单预解析 / 标识符白名单 / 函数黑名单 / LIMIT 注入 / 错误脱敏）。

## 部署

走与 `apps/server` 同一套 SAM 流水线（`scripts/deploy.sh`）。`template.yaml` 新增 `McpFunction` + ALB listener rule `/mcp/*` + CloudFront CacheBehavior。
