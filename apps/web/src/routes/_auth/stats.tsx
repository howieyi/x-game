import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@x-game/ui/components/skeleton";
import { cn } from "@x-game/ui/lib/utils";
import { useState } from "react";

import HistoryTable from "@/components/stats/history-table";
import ThemeCard from "@/components/stats/theme-card";
import {
	GAME_LIST,
	GAME_META,
	type GameId,
	THEMES,
	type Theme,
} from "@/lib/games";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/stats")({
	component: StatsRoute,
});

// Single source of truth for memory-match's chip labels. Lives next to the
// page because it is presentation-only.
const THEME_CHIP_LABELS: Record<Theme, { emoji: string; label: string }> = {
	animals: { emoji: "🦊", label: "动物" },
	space: { emoji: "🚀", label: "太空" },
	food: { emoji: "🍣", label: "美食" },
	music: { emoji: "🎵", label: "音乐" },
	ocean: { emoji: "🌊", label: "海洋" },
	gems: { emoji: "💎", label: "宝石" },
	faces: { emoji: "😎", label: "表情" },
};

function StatsRoute() {
	const [activeGame, setActiveGame] = useState<GameId>(GAME_LIST[0].id);
	const [activeTheme, setActiveTheme] = useState<Theme | null>(null);
	const [page, setPage] = useState(0);

	const meta = GAME_META[activeGame];
	const showThemeTabs = meta.hasThemes;
	const themeForQuery = showThemeTabs ? (activeTheme ?? THEMES[0]) : undefined;

	const myBest = useQuery(
		trpc.game.myBest.queryOptions({
			gameId: activeGame,
			theme: themeForQuery,
		}),
	);

	const history = useQuery(
		trpc.game.myHistory.queryOptions({
			gameId: activeGame,
			theme: themeForQuery,
			page,
			limit: 20,
		}),
	);

	const cardBest = (() => {
		const data = myBest.data;
		if (!data || Array.isArray(data)) return null;
		return data.best ?? null;
	})();

	const cardTotal = (() => {
		const data = myBest.data;
		if (!data || Array.isArray(data)) return 0;
		return data.total ?? 0;
	})();

	return (
		<section>
			<div className="mb-8 flex items-end justify-between gap-4">
				<div>
					<p className="flex items-center gap-2 text-[#d9ff43] text-[10px] uppercase tracking-[0.25em]">
						<span className="h-1.5 w-1.5 rounded-full bg-[#d9ff43] shadow-[0_0_10px_#d9ff43]" />
						Personal · Records
					</p>
					<h1 className="mt-3 font-black text-3xl tracking-[-0.04em] md:text-4xl">
						我的战绩
					</h1>
					<p className="mt-2 max-w-xl text-sm text-white/42 leading-6">
						查看每款游戏的累计战绩与最近对局记录
					</p>
				</div>
				<div className="hidden items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-[10px] text-white/45 uppercase tracking-[0.18em] sm:flex">
					{meta.label}
				</div>
			</div>

			<section className="mb-6 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
				<div className="flex flex-wrap gap-2" role="tablist" aria-label="游戏">
					{GAME_LIST.map((g) => {
						const isActive = g.id === activeGame;
						return (
							<button
								key={g.id}
								type="button"
								role="tab"
								aria-selected={isActive}
								onClick={() => {
									setActiveGame(g.id);
									setActiveTheme(null);
									setPage(0);
								}}
								className={cn(
									"inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs transition",
									isActive
										? "bg-cyan-300 font-bold text-black"
										: "border border-white/10 bg-white/[0.03] text-white/55 hover:border-white/20 hover:text-white",
								)}
							>
								<span aria-hidden="true">{g.emoji}</span>
								<span>{g.label}</span>
							</button>
						);
					})}
				</div>

				{showThemeTabs && (
					<div
						className="mt-3 flex flex-wrap gap-2 border-white/[0.06] border-t pt-3"
						role="tablist"
						aria-label="主题"
					>
						{THEMES.map((t) => {
							const themeMeta = THEME_CHIP_LABELS[t];
							const isActive = t === themeForQuery;
							return (
								<button
									key={t}
									type="button"
									role="tab"
									aria-selected={isActive}
									onClick={() => {
										setActiveTheme(t);
										setPage(0);
									}}
									className={cn(
										"inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition",
										isActive
											? "bg-white font-bold text-black"
											: "border border-white/[0.06] bg-white/[0.02] text-white/45 hover:border-white/15 hover:text-white",
									)}
								>
									<span aria-hidden="true">{themeMeta.emoji}</span>
									<span>{themeMeta.label}</span>
								</button>
							);
						})}
					</div>
				)}
			</section>

			<section aria-label="游戏总览" className="mb-6">
				<div className="mb-3 flex items-end justify-between">
					<div>
						<p className="text-[10px] text-white/30 uppercase tracking-[0.2em]">
							Game summary
						</p>
						<h2 className="mt-1 font-bold text-xl">{meta.label} 总览</h2>
					</div>
					<p className="text-[10px] text-white/30 uppercase tracking-[0.2em]">
						{cardTotal} runs
					</p>
				</div>
				{myBest.isLoading ? (
					<Skeleton className="h-32 w-full bg-white/5" />
				) : (
					<ThemeCard
						gameId={meta.id}
						label={meta.label}
						emoji={meta.emoji}
						best={
							cardBest
								? {
										score: cardBest.score,
										durationSeconds:
											cardBest.durationSeconds ?? cardBest.seconds,
									}
								: null
						}
						total={cardTotal}
						active
					/>
				)}
			</section>

			<section aria-label="历史记录">
				<div className="mb-3 flex items-end justify-between">
					<div>
						<p className="text-[10px] text-white/30 uppercase tracking-[0.2em]">
							Recent runs
						</p>
						<h2 className="mt-1 font-bold text-xl">
							历史记录
							{showThemeTabs && themeForQuery && (
								<span className="ml-2 font-normal text-sm text-white/40">
									· {THEME_CHIP_LABELS[themeForQuery].label}
								</span>
							)}
						</h2>
					</div>
				</div>
				{history.isLoading ? (
					<div className="space-y-2">
						<Skeleton className="h-10 w-full bg-white/5" />
						<Skeleton className="h-10 w-full bg-white/5" />
						<Skeleton className="h-10 w-full bg-white/5" />
					</div>
				) : (
					<HistoryTable
						items={history.data?.items ?? []}
						total={history.data?.total ?? 0}
						pageCount={history.data?.pageCount ?? 1}
						page={history.data?.page ?? 0}
						onPageChange={(next) => {
							setPage(next);
							if (typeof window !== "undefined") {
								window.scrollTo({ top: 0, behavior: "smooth" });
							}
						}}
					/>
				)}
			</section>
		</section>
	);
}
