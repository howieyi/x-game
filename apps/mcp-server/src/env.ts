import "dotenv/config";
import { z } from "zod";

/**
 * MCP server 专属 env 校验。
 *
 * 不复用 `@x-game/env/server`(它依赖 BETTER_AUTH 等业务变量,MCP server
 * 用不到),改用纯 zod 自解析。MCP 这层默认值更宽松,允许 dev 没设某些
 * 可选变量。
 */
const envSchema = z.object({
	// DB 来源:dev 用 DATABASE_URL,prod 用 DB_SECRET_ARN + 可选 DB_HOST/PORT/NAME
	DATABASE_URL: z.string().min(1).optional(),
	DB_SECRET_ARN: z.string().min(1).optional(),
	DB_HOST: z.string().min(1).optional(),
	DB_PORT: z.string().min(1).optional(),
	DB_NAME: z.string().min(1).optional(),

	// MCP 鉴权
	MCP_TOKEN_SECRET_ARN: z.string().min(1).optional(),
	MCP_TOKEN: z.string().min(1).optional(),

	// 通用 SQL 工具开关(默认 false,prod 必须显式打开)
	MCP_ENABLE_SQL_QUERY: z
		.string()
		.optional()
		.transform((v) => v === "true"),

	// Lambda metadata
	DEPLOY_STAGE: z.string().default("dev"),
	AWS_LAMBDA_FUNCTION_NAME: z.string().optional(),
	NODE_ENV: z.string().optional(),
});

const parseResult = envSchema.safeParse(process.env);
if (!parseResult.success) {
	console.error("[mcp] invalid environment:", parseResult.error.flatten());
	throw new Error("Invalid MCP environment configuration");
}

export const mcpEnv = parseResult.data;
