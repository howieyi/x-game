import type { ToolRegistry } from "../server";
import { registerAnalyticsTools } from "./analytics";
import { registerGameTools } from "./game";
import { registerLogsTools } from "./logs";
import { registerSqlTools } from "./sql";

/**
 * Aggregate entry for tool registration.
 *
 * `sql_query` is opt-in: it only appears in `tools/list` when the MCP server
 * is started with `MCP_ENABLE_SQL_QUERY=true`. Prod keeps it disabled by
 * default to keep the blast radius of the 8-layer defense small.
 */
export function registerAllTools(registry: ToolRegistry): void {
	registerAnalyticsTools(registry);
	registerGameTools(registry);
	registerLogsTools(registry);
	registerSqlTools(registry);
}
