import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildMcpServer, type ToolRegistry } from "./server";
import { registerAllTools } from "./tools";

/**
 * Web standard Streamable HTTP transport 工厂。
 *
 * 用 web `Request` / `Response` 适配 Hono(Lambda / Node server 都把
 * `c.req.raw` 转成 web Request),不需要 Node `IncomingMessage`。每个
 * 请求 new 一个 stateless transport + server 对,与 Lambda 短进程天
 * 然契合。
 *
 * 如果未来需要 LLM 流式 tool 输出,再切到 `sessionIdGenerator: () => uuid()`
 * 的 stateful 模式 + 在 app 里维护 session 池。
 */

export interface McpServerTransport {
	transport: WebStandardStreamableHTTPServerTransport;
	server: Server;
}

export async function createStatelessMcp(): Promise<McpServerTransport> {
	const registry: ToolRegistry = {
		tools: [],
		handlerMap: new Map(),
	};

	// Each request gets its own registry; tools/*.ts populate it eagerly.
	// M4's SQL tool will gate on mcpEnv.MCP_ENABLE_SQL_QUERY at registration time.
	registerAllTools(registry);

	const server = buildMcpServer(registry);

	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true,
	});

	await server.connect(transport);

	return { server, transport };
}
