import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Activity, Gamepad2, LayoutGrid, Trophy, Users } from "lucide-react";
import type { ReactNode } from "react";

import { authClient } from "@/lib/auth-client";

// Sidebar entries mirror the platform console. A future per-route override
// (workspace switching, admin tooling, ...) would plug in here.
const NAV = [
	{ to: "/", Icon: LayoutGrid, label: "控制台" },
	{ to: "/arcade-2d", Icon: Gamepad2, label: "游戏" },
	{ to: "/leaderboard", Icon: Trophy, label: "排行榜" },
	{ to: "/stats", Icon: Users, label: "统计" },
	{ to: "/analytics", Icon: Activity, label: "分析" },
] as const;

export interface ConsoleShellProps {
	children: ReactNode;
	// Optional banner shown right of the brand chip in the header. Used by
	// routes that want to surface environment / build info.
	statusBadge?: ReactNode;
	// Optional trailing slot in the header (e.g. range pickers, filters).
	rightSlot?: ReactNode;
}

/**
 * Shared chrome for every console-shaped page: brand sidebar + top bar with
 * session chip, then a clean content well. Mirrors the design tokens of the
 * home page (`nexus-bg`, `#d9ff43` accent, 78px column width) so any route
 * nested under it inherits the platform's visual language.
 */
export default function ConsoleShell({
	children,
	statusBadge,
	rightSlot,
}: ConsoleShellProps) {
	const navigate = useNavigate();
	const location = useLocation();
	const { data: session } = authClient.useSession();

	return (
		<div className="nexus-bg min-h-svh bg-[#05070a] text-[#eef1f7]">
			<div className="mx-auto flex min-h-svh max-w-[1500px]">
				<aside className="hidden w-[78px] shrink-0 flex-col items-center border-white/[0.06] border-r py-7 lg:flex">
					<Link
						to="/"
						aria-label="返回控制台"
						title="返回控制台"
						className="grid h-10 w-10 place-items-center rounded-xl bg-[#d9ff43] text-black"
					>
						<Gamepad2 size={21} strokeWidth={2.6} />
					</Link>
					<nav className="mt-14 flex flex-col gap-2">
						{NAV.map(({ to, Icon, label }) => {
							const active =
								to === "/"
									? location.pathname === "/"
									: location.pathname === to ||
										location.pathname.startsWith(`${to}/`);
							return (
								<Link
									key={to}
									to={to}
									aria-label={label}
									title={label}
									className={`grid h-10 w-10 place-items-center rounded-xl transition ${active ? "bg-white/10 text-white" : "text-white/25 hover:bg-white/5 hover:text-white/70"}`}
								>
									<Icon size={18} />
								</Link>
							);
						})}
					</nav>
					<div className="mt-auto grid h-9 w-9 place-items-center rounded-full border border-[#d9ff43]/25 bg-[#d9ff43]/10 font-bold text-[#d9ff43] text-xs">
						{session?.user?.name?.slice(0, 1).toUpperCase() ?? "N"}
					</div>
				</aside>

				<div className="min-w-0 flex-1">
					<header className="flex h-[78px] items-center justify-between gap-3 border-white/[0.06] border-b px-5 sm:px-9">
						<div className="flex items-center gap-3">
							<div>
								<p className="font-bold text-sm tracking-[0.12em]">NEXUS</p>
								<p className="text-[9px] text-white/25 uppercase tracking-[0.28em]">
									Game operations system
								</p>
							</div>
							{statusBadge ?? (
								<div className="hidden items-center gap-2 rounded-full border border-white/[0.07] px-3 py-2 text-[10px] text-white/35 sm:flex">
									<span className="h-1.5 w-1.5 rounded-full bg-[#d9ff43] shadow-[0_0_10px_#d9ff43]" />
									AWS US-EAST-1 · 健康
								</div>
							)}
						</div>
						<div className="flex items-center gap-3">
							{rightSlot}
							{session?.user ? (
								<button
									type="button"
									className="rounded-full border border-white/10 px-4 py-2 text-white/55 text-xs transition hover:text-white"
									onClick={() =>
										authClient.signOut({
											fetchOptions: {
												onSuccess: () => navigate({ to: "/login" }),
											},
										})
									}
								>
									退出
								</button>
							) : (
								<Link
									to="/login"
									className="rounded-full bg-[#d9ff43] px-4 py-2 font-bold text-black text-xs"
								>
									控制台登录
								</Link>
							)}
						</div>
					</header>

					<main className="px-5 py-8 sm:px-9 lg:py-10">{children}</main>
				</div>
			</div>
		</div>
	);
}
