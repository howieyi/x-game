import { redirect } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";

/**
 * 登录拦截：未登录用户访问受保护路由时重定向到 /login。
 * 在路由的 beforeLoad 中调用，返回带 session 的上下文。
 */
export async function requireAuth() {
	const session = await authClient.getSession();
	if (!session.data) {
		throw redirect({ to: "/login" });
	}
	return { session };
}
