import { createDb } from "@x-game/db";
import * as schema from "@x-game/db/schema/auth";
import { env } from "@x-game/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { sendNewUserRegistrationNotification } from "./registration-notifier";

export function createAuth() {
	const db = createDb();

	return betterAuth({
		database: drizzleAdapter(db, {
			provider: "pg",

			schema: schema,
		}),
		trustedOrigins: [env.CORS_ORIGIN],
		emailAndPassword: {
			enabled: true,
		},
		databaseHooks: {
			user: {
				create: {
					after: async (user) => {
						try {
							await sendNewUserRegistrationNotification(user);
						} catch (error) {
							// 飞书属于注册后的旁路通知。通知失败需要保留错误日志，
							// 但不能让已经成功写入数据库的用户收到注册失败响应。
							console.error(
								"[auth.registration] 飞书新用户通知发送失败",
								error,
							);
						}
					},
				},
			},
		},
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		advanced: {
			defaultCookieAttributes: {
				sameSite: "none",
				secure: true,
				httpOnly: true,
			},
		},
		plugins: [],
	});
}

export const auth = createAuth();
