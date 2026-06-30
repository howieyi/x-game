import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@x-game/ui/components/button";

import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/")({
	component: HomeComponent,
});

type FeatureCardProps = {
	emoji: string;
	title: string;
	description: string;
	href: string;
	ctaLabel: string;
	accent: string;
};

function FeatureCard({
	emoji,
	title,
	description,
	href,
	ctaLabel,
	accent,
}: FeatureCardProps) {
	return (
		<Link
			to={href}
			className="group relative block overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 outline-none backdrop-blur-sm transition-all hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.06] focus-visible:border-white/30"
		>
			<div
				className={`-right-8 -top-8 absolute h-24 w-24 rounded-full opacity-20 blur-2xl transition-opacity group-hover:opacity-40 ${accent}`}
			/>
			<div className="relative flex flex-col gap-3">
				<span className="text-4xl">{emoji}</span>
				<h3 className="font-semibold text-lg text-white">{title}</h3>
				<p className="text-sm text-white/60">{description}</p>
				<span className="mt-2 inline-flex items-center gap-1 font-medium text-sm text-white/80 transition-transform group-hover:translate-x-1">
					{ctaLabel} →
				</span>
			</div>
		</Link>
	);
}

function HomeComponent() {
	const navigate = useNavigate();
	const { data: session } = authClient.useSession();
	const isLoggedIn = Boolean(session?.user);
	const userName = session?.user.name ?? "玩家";

	return (
		<div className="relative min-h-svh overflow-hidden bg-[#0a0a0f] text-white">
			{/* 背景光晕 */}
			<div className="pointer-events-none absolute inset-0">
				<div className="-translate-x-1/2 absolute top-[-10%] left-1/2 h-[420px] w-[820px] rounded-full bg-gradient-to-r from-indigo-600/30 via-fuchsia-600/20 to-cyan-500/30 blur-[120px]" />
			</div>

			<div className="relative mx-auto flex min-h-svh max-w-5xl flex-col px-4 py-6">
				{/* 顶部用户条 */}
				<div className="flex items-center justify-between">
					<span className="font-semibold text-lg tracking-tight">
						<span className="bg-gradient-to-r from-indigo-400 to-fuchsia-400 bg-clip-text text-transparent">
							x-game
						</span>
					</span>
					<div className="flex items-center gap-3">
						{isLoggedIn ? (
							<>
								<span className="hidden text-sm text-white/60 sm:inline">
									{userName}
								</span>
								<Button
									variant="outline"
									size="sm"
									className="border-white/15 bg-white/5 text-white hover:bg-white/10"
									onClick={() => {
										authClient.signOut({
											fetchOptions: {
												onSuccess: () => navigate({ to: "/login" }),
											},
										});
									}}
								>
									退出登录
								</Button>
							</>
						) : (
							<Link to="/login">
								<Button
									size="sm"
									className="bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white hover:from-indigo-400 hover:to-fuchsia-400"
								>
									登录 / 注册
								</Button>
							</Link>
						)}
					</div>
				</div>

				{/* Hero */}
				<section className="flex flex-1 flex-col justify-center py-16">
					<p className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/70 text-xs">
						<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
						{isLoggedIn ? `欢迎回来，${userName}` : "登录后即可保存成绩并上榜"}
					</p>
					<h1 className="font-bold text-4xl leading-tight tracking-tight md:text-6xl">
						翻牌挑战
						<br />
						<span className="bg-gradient-to-r from-indigo-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
							记忆与手速的较量
						</span>
					</h1>
					<p className="mt-5 max-w-xl text-base text-white/60">
						4×4 牌阵 · 7 种主题 · 记录每一局战绩，与全球玩家同台竞技。
					</p>
					<div className="mt-8 flex flex-col gap-3 sm:flex-row">
						<Link to="/game">
							<Button
								size="lg"
								className="w-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white shadow-lg shadow-fuchsia-500/20 transition-transform hover:scale-[1.02] hover:from-indigo-400 hover:to-fuchsia-400 sm:w-auto"
							>
								开始挑战 →
							</Button>
						</Link>
						<Link to="/leaderboard">
							<Button
								size="lg"
								variant="outline"
								className="w-full border-white/15 bg-white/5 text-white hover:bg-white/10 sm:w-auto"
							>
								查看排行榜
							</Button>
						</Link>
					</div>
				</section>

				{/* 功能卡片 */}
				<section
					aria-label="功能入口"
					className="grid grid-cols-1 gap-4 pb-10 md:grid-cols-3"
				>
					<FeatureCard
						emoji="🎴"
						title="记忆翻牌"
						description="4×4 牌阵，7 种主题，翻牌配对比拼手速与记忆力。"
						href="/game"
						ctaLabel="开始挑战"
						accent="bg-indigo-500"
					/>
					<FeatureCard
						emoji="📊"
						title="我的战绩"
						description="按主题分别追踪最佳步数、用时与三星次数。"
						href="/stats"
						ctaLabel="查看战绩"
						accent="bg-fuchsia-500"
					/>
					<FeatureCard
						emoji="🏆"
						title="全球排行榜"
						description="按主题 Top 10 排名，步数升序、相同时长决胜。"
						href="/leaderboard"
						ctaLabel="查看排行榜"
						accent="bg-cyan-500"
					/>
				</section>
			</div>
		</div>
	);
}
