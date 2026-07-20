import { timingSafeEqual } from "node:crypto";
import {
	GetSecretValueCommand,
	SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { mcpEnv } from "./env";

/**
 * MCP server endpoint 鉴权。
 *
 * 强制 `Authorization: Bearer <MCP_TOKEN>`,常量时间比较。token 在第
 * 一次请求时从 Secrets Manager 拉取并缓存(避免 QPS 配额)。
 *
 * 注意:MCP server **不做** per-user 鉴权,只校验 endpoint。`userId`
 * 走工具入参 `callerUserId`,调用方自己负责把越权 filter 加在调用之前。
 */

let _cachedToken: string | null = null;
let _smClient: SecretsManagerClient | null = null;

function getSmClient(): SecretsManagerClient {
	if (!_smClient) _smClient = new SecretsManagerClient({});
	return _smClient;
}

async function resolveMcpToken(): Promise<string> {
	if (_cachedToken) return _cachedToken;

	if (mcpEnv.MCP_TOKEN_SECRET_ARN) {
		const out = await getSmClient().send(
			new GetSecretValueCommand({ SecretId: mcpEnv.MCP_TOKEN_SECRET_ARN }),
		);
		const secret = out.SecretString;
		if (!secret) {
			throw new Error(
				`Secrets Manager returned no SecretString for ${mcpEnv.MCP_TOKEN_SECRET_ARN}`,
			);
		}
		_cachedToken = secret;
		return secret;
	}

	if (mcpEnv.MCP_TOKEN) {
		_cachedToken = mcpEnv.MCP_TOKEN;
		return _cachedToken;
	}

	throw new Error(
		"MCP token is not configured — set MCP_TOKEN (dev) or MCP_TOKEN_SECRET_ARN (prod).",
	);
}

function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) {
		// timingSafeEqual requires equal length; perform a dummy compare anyway
		// so the response time is not informative about length.
		const dummy = Buffer.alloc(a.length);
		timingSafeEqual(Buffer.from(a), dummy);
		return false;
	}
	return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export interface AuthOk {
	ok: true;
}

export interface AuthFail {
	ok: false;
	reason: string;
}

/**
 * Inspect the `Authorization` header on an incoming MCP request and return
 * whether the bearer token matches the configured `MCP_TOKEN`.
 */
export async function verifyMcpAuth(
	authorizationHeader: string | null | undefined,
): Promise<AuthOk | AuthFail> {
	if (!authorizationHeader) {
		return { ok: false, reason: "missing Authorization header" };
	}
	const [scheme, token] = authorizationHeader.split(" ", 2);
	if (scheme?.toLowerCase() !== "bearer" || !token) {
		return { ok: false, reason: "expected Bearer scheme" };
	}

	let expected: string;
	try {
		expected = await resolveMcpToken();
	} catch (err) {
		console.error("[mcp] failed to resolve MCP token:", err);
		return { ok: false, reason: "server misconfigured" };
	}

	if (!safeEqual(token, expected)) {
		return { ok: false, reason: "token mismatch" };
	}
	return { ok: true };
}
