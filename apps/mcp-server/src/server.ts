import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
	type CallToolRequest,
	type CallToolResult,
	type ListToolsResult,
	type Tool,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * MCP Server 工厂 + 工具注册中心。
 *
 * `ToolRegistry` 是一个进程内的"未连接"表，让工具实现者在 server 启
 * 动前 setRequestHandler 之前完成 self-registration。M1 阶段工具还没
 * 上线，registry 始终为空：`tools/list` 返回 `[]`。
 *
 * 后续 M2 之后，tools/*.ts 的 `registerXxxTools(server, registry)` 会
 * 在这里被依次调用，把自己的 Tool schema + handler 注册进来。
 */

export interface ToolHandler {
	schema: Tool;
	handle: (args: Record<string, unknown>) => Promise<CallToolResult>;
}

export interface ToolRegistry {
	tools: Tool[];
	handlerMap: Map<string, ToolHandler>;
}

export function buildMcpServer(registry: ToolRegistry): Server {
	const server = new Server(
		{
			name: "x-game-mcp-server",
			version: "0.1.0",
		},
		{
			capabilities: {
				tools: {},
			},
		},
	);

	server.setRequestHandler(
		ListToolsRequestSchema,
		async (): Promise<ListToolsResult> => ({
			tools: registry.tools,
		}),
	);

	server.setRequestHandler(
		CallToolRequestSchema,
		async (request: CallToolRequest): Promise<CallToolResult> => {
			const name = request.params.name;
			const handler = registry.handlerMap.get(name);
			if (!handler) {
				return {
					isError: true,
					content: [
						{
							type: "text",
							text: `unknown tool: ${name}`,
						},
					],
				};
			}
			const start = Date.now();
			let result: CallToolResult;
			try {
				result = await handler.handle(request.params.arguments ?? {});
			} catch (err) {
				console.error(`[mcp] tool ${name} threw:`, err);
				result = {
					isError: true,
					content: [
						{
							type: "text",
							text: `internal tool error`,
						},
					],
				};
			}
			const durationMs = Date.now() - start;
			console.log(
				JSON.stringify({
					message: "mcp.call",
					tool: name,
					durationMs,
					isError: !!result.isError,
				}),
			);
			return result;
		},
	);

	return server;
}

/**
 * Register a single tool into the registry. Convenience helper used by
 * each tools/*.ts module.
 */
export function registerTool(
	registry: ToolRegistry,
	handler: ToolHandler,
): void {
	registry.tools.push(handler.schema);
	registry.handlerMap.set(handler.schema.name, handler);
}
