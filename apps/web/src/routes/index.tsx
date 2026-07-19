import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
	Activity,
	ArrowUpRight,
	Box,
	Boxes,
	Gamepad2,
	LayoutGrid,
	Radio,
	Rocket,
	ShieldCheck,
	Swords,
	Trophy,
	Users,
	Zap,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/")({ component: HomeComponent });

const games = [
	{
		id: "NX-01",
		title: "霓虹突围",
		subtitle: "Phaser 2D",
		description: "穿越赛博防火墙，回收全部能量核心。",
		to: "/arcade-2d",
		icon: Radio,
		accent: "cyan",
		status: "在线",
	},
	{
		id: "NX-02",
		title: "星轨竞速",
		subtitle: "Three.js 3D",
		description: "驾驶星舰，在无尽量子赛道中极限闪避。",
		to: "/arena-3d",
		icon: Box,
		accent: "violet",
		status: "在线",
	},
	{
		id: "NX-03",
		title: "记忆矩阵",
		subtitle: "策略 / 益智",
		description: "七大主题牌组，挑战记忆与决策速度。",
		to: "/game",
		icon: LayoutGrid,
		accent: "amber",
		status: "赛季中",
	},
	{
		id: "NX-04",
		title: "量子风暴",
		subtitle: "Phaser 2D / 射击",
		description: "自由瞄准、连续击破，在升级敌群中守住量子护盾。",
		to: "/quantum-storm",
		icon: Rocket,
		accent: "magenta",
		status: "新上线",
	},
	{
		id: "NX-05",
		title: "重力裂隙",
		subtitle: "Phaser 2D / 跑酷",
		description: "一键反转重力，穿越持续加速的霓虹裂隙。",
		to: "/gravity-rift",
		icon: Zap,
		accent: "indigo",
		status: "新上线",
	},
] as const;

const platformStats: Array<[string, string, LucideIcon]> = [
	["05", "在线游戏", Gamepad2],
	["12.8K", "活跃玩家", Users],
	["99.98%", "服务可用", ShieldCheck],
	["24", "本周赛事", Trophy],
];

function GameCard({ game }: { game: (typeof games)[number] }) {
	const Icon = game.icon;
	return (
		<Link
			to={game.to}
			className={`nexus-card group relative min-h-[260px] overflow-hidden rounded-2xl border p-5 ${game.accent}`}
		>
			<div className="flex items-center justify-between">
				<span className="font-mono text-[10px] text-white/35 tracking-[0.18em]">
					{game.id}
				</span>
				<span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-2 py-1 text-[10px] text-emerald-300">
					<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
					{game.status}
				</span>
			</div>
			<div className="mt-12">
				<div className="mb-5 inline-grid h-12 w-12 place-items-center rounded-xl border border-white/10 bg-black/20">
					<Icon size={22} />
				</div>
				<p className="text-[10px] text-white/40 uppercase tracking-[0.22em]">
					{game.subtitle}
				</p>
				<h3 className="mt-1 font-black text-2xl tracking-[-0.04em]">
					{game.title}
				</h3>
				<p className="mt-2 max-w-[260px] text-white/45 text-xs leading-5">
					{game.description}
				</p>
			</div>
			<ArrowUpRight className="absolute right-5 bottom-5 text-white/25 transition group-hover:translate-x-1 group-hover:-translate-y-1 group-hover:text-white" />
		</Link>
	);
}

function HomeComponent() {
	const navigate = useNavigate();
	const { data: session } = authClient.useSession();

	return (
		<div className="nexus-bg min-h-svh bg-[#05070a] text-[#eef1f7]">
			<div className="mx-auto flex min-h-svh max-w-[1500px]">
				<aside className="hidden w-[78px] shrink-0 flex-col items-center border-white/[0.06] border-r py-7 lg:flex">
					<div className="grid h-10 w-10 place-items-center rounded-xl bg-[#d9ff43] text-black">
						<Gamepad2 size={21} strokeWidth={2.6} />
					</div>
					<nav className="mt-14 flex flex-col gap-2">
						{[LayoutGrid, Gamepad2, Trophy, Users, Activity].map(
							(Icon, index) => (
								<button
									type="button"
									key={Icon.displayName ?? index}
									aria-label={`导航 ${index + 1}`}
									className={`grid h-10 w-10 place-items-center rounded-xl transition ${index === 0 ? "bg-white/10 text-white" : "text-white/25 hover:bg-white/5 hover:text-white/70"}`}
								>
									<Icon size={18} />
								</button>
							),
						)}
					</nav>
					<div className="mt-auto grid h-9 w-9 place-items-center rounded-full border border-[#d9ff43]/25 bg-[#d9ff43]/10 font-bold text-[#d9ff43] text-xs">
						{session?.user?.name?.slice(0, 1).toUpperCase() ?? "N"}
					</div>
				</aside>

				<div className="min-w-0 flex-1">
					<header className="flex h-[78px] items-center justify-between border-white/[0.06] border-b px-5 sm:px-9">
						<div>
							<p className="font-bold text-sm tracking-[0.12em]">NEXUS</p>
							<p className="text-[9px] text-white/25 uppercase tracking-[0.28em]">
								Game operations system
							</p>
						</div>
						<div className="flex items-center gap-3">
							<div className="hidden items-center gap-2 rounded-full border border-white/[0.07] px-3 py-2 text-[10px] text-white/35 sm:flex">
								<span className="h-1.5 w-1.5 rounded-full bg-[#d9ff43] shadow-[0_0_10px_#d9ff43]" />
								AWS US-EAST-1 · 健康
							</div>
							{session?.user ? (
								<button
									type="button"
									className="rounded-full border border-white/10 px-4 py-2 text-white/55 text-xs hover:text-white"
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

					<main className="px-5 py-8 sm:px-9 lg:py-10">
						<section className="grid gap-8 xl:grid-cols-[1fr_360px]">
							<div>
								<div className="inline-flex items-center gap-2 text-[#d9ff43] text-[10px] uppercase tracking-[0.25em]">
									<Swords size={13} /> Season 08 / Live
								</div>
								<h1 className="mt-4 max-w-4xl font-black text-5xl leading-[0.92] tracking-[-0.065em] sm:text-7xl lg:text-[92px]">
									掌控每一场
									<br />
									<span className="text-white/22">数字战役。</span>
								</h1>
								<p className="mt-6 max-w-xl text-sm text-white/42 leading-6">
									统一管理游戏、玩家、赛事与运行状态。探索 2D / 3D
									互动实验，实时掌握平台脉搏。
								</p>
							</div>
							<div className="grid grid-cols-2 gap-px self-end overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.07]">
								{platformStats.map(([value, label, Icon]) => (
									<div key={String(label)} className="bg-[#0a0d12] p-5">
										<Icon size={15} className="mb-5 text-white/25" />
										<p className="font-black text-2xl tracking-tight">
											{value}
										</p>
										<p className="mt-1 text-[10px] text-white/30 uppercase">
											{label}
										</p>
									</div>
								))}
							</div>
						</section>

						<section className="mt-14">
							<div className="mb-4 flex items-end justify-between">
								<div>
									<p className="text-[10px] text-white/30 uppercase tracking-[0.2em]">
										Game library
									</p>
									<h2 className="mt-1 font-bold text-xl">游戏矩阵</h2>
								</div>
								<div className="flex items-center gap-2 text-white/25 text-xs">
									<Boxes size={15} /> 5 个项目
								</div>
							</div>
							<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
								{games.map((game) => (
									<GameCard key={game.id} game={game} />
								))}
							</div>
						</section>
					</main>
				</div>
			</div>
		</div>
	);
}
