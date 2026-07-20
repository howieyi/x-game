#!/usr/bin/env -S npx tsx
/**
 * Manual smoke test for the Feishu bot webhook.
 *
 *   pnpm --filter server feishu:test "your message"
 *   pnpm --filter server feishu:test --json '{"msg_type":"text","content":{"text":"hi"}}'
 *   pnpm --filter server feishu:test --dry-run
 *
 * Reads `FEISHU_ANALYTICS_WEBHOOK_URL` from either `apps/server/.env`
 * (what tsx watch loads at server boot) or the monorepo root `.env`
 * (shared tooling). Exits non-zero with a human-readable reason when the
 * bot is not configured or the upstream call fails, so this script doubles
 * as a health check in CI.
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

const SCRIPT_DIR = import.meta.dirname;
const CANDIDATE_PATHS = [
	resolve(SCRIPT_DIR, "../.env"), // apps/server/.env (server runtime)
	resolve(SCRIPT_DIR, "../../../.env"), // monorepo root .env (shared tooling)
];
for (const path of CANDIDATE_PATHS) loadEnv({ path, override: false });

const FEISHU_KEY = "FEISHU_ANALYTICS_WEBHOOK_URL";
const url = process.env[FEISHU_KEY];

type CliOptions = {
	body: string;
	dryRun: boolean;
	timeoutMs: number;
};

function parseArgs(argv: ReadonlyArray<string>): CliOptions {
	const opts: CliOptions = {
		body: "【NEXUS 行为监控告警】\n• 飞书 webhook 手动测试",
		dryRun: false,
		timeoutMs: 5000,
	};
	const positional: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === undefined) continue;
		if (arg === "--json") {
			const next = argv[++i];
			if (typeof next === "string") opts.body = next;
		} else if (arg === "--dry-run") {
			opts.dryRun = true;
		} else if (arg === "--timeout") {
			const next = argv[++i];
			const raw = Number(next);
			if (Number.isFinite(raw) && raw > 0) opts.timeoutMs = raw;
		} else if (arg === "--help" || arg === "-h") {
			console.log(
				"Usage: tsx scripts/feishu-test.ts [message] [--json <body>] [--dry-run] [--timeout <ms>]",
			);
			process.exit(0);
		} else {
			positional.push(arg);
		}
	}
	if (positional.length > 0) opts.body = positional.join(" ");
	return opts;
}

async function main() {
	const opts = parseArgs(process.argv.slice(2));

	if (!url) {
		console.error(
			`✗ ${FEISHU_KEY} is not set in any of:\n  ${CANDIDATE_PATHS.join("\n  ")}`,
		);
		console.error("  alerts will silently no-op until this is configured.");
		console.error(
			"  Add the URL: FEISHU_ANALYTICS_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/<token>",
		);
		process.exit(2);
	}

	const payload =
		opts.body.trim().startsWith("{") && opts.body.trim().endsWith("}")
			? opts.body
			: JSON.stringify({
					msg_type: "text",
					content: { text: opts.body },
				});

	console.log(`→ POST ${url}`);
	console.log(
		`  body: ${payload.length > 200 ? `${payload.slice(0, 200)}…` : payload}`,
	);

	if (opts.dryRun) {
		console.log("✓ dry-run only — request not sent.");
		return;
	}

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

	let response: Response;
	try {
		response = await fetch(url, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: payload,
			signal: controller.signal,
		});
	} catch (error) {
		clearTimeout(timer);
		const reason =
			error instanceof Error && error.name === "AbortError"
				? `timed out after ${opts.timeoutMs}ms`
				: (error as Error).message;
		console.error(`✗ network failure: ${reason}`);
		process.exit(3);
	}
	clearTimeout(timer);

	const text = await response.text();
	console.log(`← HTTP ${response.status}`);
	if (text) console.log(`  body: ${text.slice(0, 400)}`);

	// Feishu's bot endpoint returns `{"StatusCode":0,"StatusMessage":"success"}`
	// on success. Non-zero StatusCode usually means the bot is disabled, the
	// token is wrong, or the signature check failed.
	try {
		const json = JSON.parse(text) as { StatusCode?: number; msg?: string };
		if (typeof json.StatusCode === "number" && json.StatusCode !== 0) {
			console.error(
				`✗ Feishu rejected the message (StatusCode=${json.StatusCode}): ${json.msg ?? ""}`,
			);
			process.exit(4);
		}
	} catch {
		// Non-JSON response is still informative; treat non-2xx as failure.
	}

	if (!response.ok) {
		console.error(`✗ HTTP ${response.status} — webhook returned an error.`);
		process.exit(4);
	}

	console.log("✓ Feishu accepted the message — check the bot's chat for the post.");
}

main().catch((error) => {
	console.error("✗ unexpected error:", error);
	process.exit(1);
});