import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { cn } from "@x-game/ui/lib/utils";
import { Gamepad2 } from "lucide-react";
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

type Mode = "signIn" | "signUp";

const MODES: ReadonlyArray<{ value: Mode; label: string; eyebrow: string }> = [
	{ value: "signIn", label: "登录", eyebrow: "Sign in" },
	{ value: "signUp", label: "注册", eyebrow: "Sign up" },
];

function RouteComponent() {
	const [mode, setMode] = useState<Mode>("signIn");
	const active = MODES.find((entry) => entry.value === mode) ?? MODES[0];

	return (
		<div className="nexus-bg relative flex min-h-svh items-center justify-center overflow-hidden bg-[#05070a] px-4 py-10 text-[#eef1f7]">
			{/* Background glows — same vocabulary as the home page hero. */}
			<div className="pointer-events-none absolute inset-0">
				<div className="absolute top-[-15%] left-1/2 h-[480px] w-[860px] -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-600/25 via-fuchsia-600/15 to-cyan-500/25 blur-[130px]" />
				<div className="absolute right-[-10%] bottom-[-15%] h-[360px] w-[360px] rounded-full bg-fuchsia-600/20 blur-[120px]" />
			</div>

			<div className="relative w-full max-w-md">
				{/* Brand — mirrors the console home header. */}
				<Link
					to="/"
					aria-label="返回 NEXUS 控制台"
					className="mb-8 flex items-center justify-center gap-3"
				>
					<span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#d9ff43] text-black shadow-[0_0_24px_rgba(217,255,67,0.45)]">
						<Gamepad2 size={24} strokeWidth={2.6} />
					</span>
					<span className="flex flex-col leading-tight">
						<span className="font-bold text-lg tracking-[0.14em]">NEXUS</span>
						<span className="text-[9px] text-white/35 uppercase tracking-[0.28em]">
							Game operations system
						</span>
					</span>
				</Link>

				<div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-7 backdrop-blur-md">
					<div className="mb-6">
						<p className="flex items-center gap-2 text-[#d9ff43] text-[11px] uppercase tracking-[0.28em]">
							<span className="h-1.5 w-1.5 rounded-full bg-[#d9ff43] shadow-[0_0_10px_#d9ff43]" />
							{active.eyebrow}
						</p>
						<h1 className="mt-2 font-black text-3xl tracking-[-0.04em] md:text-4xl">
							{mode === "signIn" ? "欢迎回来" : "创建账号"}
						</h1>
						<p className="mt-2 text-base text-white/55 leading-6">
							{mode === "signIn"
								? "登录后继续你的战绩之旅"
								: "加入 x-game，开启你的平台之旅"}
						</p>
					</div>

					{/* Mode switcher — taller, brighter, cyan accent ring on the
					    active segment so it's the visual anchor of the card. */}
					<fieldset
						aria-label="登录或注册"
						className="mb-7 flex w-full gap-1 rounded-full border border-cyan-300/20 bg-black/40 p-1"
					>
						{MODES.map((entry) => {
							const isActive = entry.value === mode;
							return (
								<button
									key={entry.value}
									type="button"
									aria-pressed={isActive}
									onClick={() => setMode(entry.value)}
									className={cn(
										"flex-1 rounded-full px-4 py-2.5 text-sm tracking-[0.04em] transition",
										isActive
											? "bg-cyan-300 font-bold text-black shadow-[0_0_18px_rgba(34,211,238,0.45)]"
											: "text-white/65 hover:text-white",
									)}
								>
									{entry.label}
								</button>
							);
						})}
					</fieldset>

					{mode === "signIn" ? (
						<SignInForm onSwitchToSignUp={() => setMode("signUp")} />
					) : (
						<SignUpForm onSwitchToSignIn={() => setMode("signIn")} />
					)}
				</div>

				<p className="mt-6 text-center text-[10px] text-white/30 uppercase tracking-[0.18em]">
					登录即代表你同意我们的服务条款与隐私政策
				</p>
			</div>
		</div>
	);
}
