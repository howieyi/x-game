import { env } from "@x-game/env/server";

type NewUser = {
	id: string;
	name: string;
	email: string;
	createdAt: Date;
};

type FetchLike = typeof fetch;

function maskEmail(email: string): string {
	const [local = "", domain = ""] = email.split("@");
	if (!domain) return "***";
	const visible = local.slice(0, Math.min(2, local.length));
	return `${visible}${"*".repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}

/**
 * 在用户写入数据库后发送飞书通知。
 *
 * 这里只发送用户 ID、昵称和脱敏邮箱，避免把完整登录标识泄露给外部系统。
 * 函数在飞书明确返回成功前不会静默完成，调用方负责记录错误但不能回滚注册。
 */
export async function sendNewUserRegistrationNotification(
	user: NewUser,
	fetchImpl: FetchLike = fetch,
): Promise<void> {
	const url = env.FEISHU_ANALYTICS_WEBHOOK_URL;
	if (!url) return;

	const response = await fetchImpl(url, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			msg_type: "text",
			content: {
				text: [
					"【NEXUS 新用户注册】",
					`• 用户：${user.name}`,
					`• 邮箱：${maskEmail(user.email)}`,
					`• 用户 ID：${user.id}`,
					`• 时间：${user.createdAt.toISOString()}`,
				].join("\n"),
			},
		}),
		signal: AbortSignal.timeout(5000),
	});

	if (!response.ok) {
		throw new Error(`飞书 Webhook 返回 HTTP ${response.status}`);
	}

	const result = (await response.json().catch(() => null)) as {
		StatusCode?: number;
		code?: number;
	} | null;
	const businessCode = result?.StatusCode ?? result?.code;
	if (typeof businessCode === "number" && businessCode !== 0) {
		throw new Error(`飞书 Webhook 拒绝请求，业务码 ${businessCode}`);
	}
}
