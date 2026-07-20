import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/login")({
	component: RouteComponent,
	beforeLoad: async () => {
		const session = await authClient.getSession();
		if (session.data) {
			throw redirect({ to: "/" });
		}
	},
});

function RouteComponent() {
	const [mode, setMode] = useState<"signIn" | "signUp">("signIn");

	return (
		<div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-[#0a0a0f] px-4 py-10 text-white">
			{/* 背景光晕 */}
			<div className="pointer-events-none absolute inset-0">
				<div className="absolute top-[-15%] left-1/2 h-[520px] w-[920px] -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-600/30 via-fuchsia-600/25 to-cyan-500/30 blur-[130px]" />
				<div className="absolute right-[-10%] bottom-[-15%] h-[380px] w-[380px] rounded-full bg-fuchsia-600/20 blur-[120px]" />
			</div>

			<div className="relative w-full max-w-md">
				{/* 品牌 */}
				<div className="mb-8 text-center">
					<h1 className="font-bold text-4xl tracking-tight">
						<span className="bg-gradient-to-r from-indigo-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
							x-game
						</span>
					</h1>
					<p className="mt-2 text-sm text-white/50">
						翻牌挑战 · 记录战绩 · 与全球玩家同台竞技
					</p>
				</div>

				{/* 玻璃卡片 */}
				<div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
					{/* 切换分段控件 */}
					<div className="mb-7 grid grid-cols-2 gap-1 rounded-full border border-white/10 bg-black/30 p-1">
						<button
							type="button"
							onClick={() => setMode("signIn")}
							className={`rounded-full py-2 font-medium text-sm transition-all ${
								mode === "signIn"
									? "bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white shadow-fuchsia-500/20 shadow-lg"
									: "text-white/50 hover:text-white/80"
							}`}
						>
							登录
						</button>
						<button
							type="button"
							onClick={() => setMode("signUp")}
							className={`rounded-full py-2 font-medium text-sm transition-all ${
								mode === "signUp"
									? "bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white shadow-fuchsia-500/20 shadow-lg"
									: "text-white/50 hover:text-white/80"
							}`}
						>
							注册
						</button>
					</div>

					{mode === "signIn" ? (
						<SignInForm onSwitchToSignUp={() => setMode("signUp")} />
					) : (
						<SignUpForm onSwitchToSignIn={() => setMode("signIn")} />
					)}
				</div>

				<p className="mt-6 text-center text-white/30 text-xs">
					登录即代表你同意我们的服务条款与隐私政策
				</p>
			</div>
		</div>
	);
}
