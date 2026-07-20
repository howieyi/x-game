import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@x-game/ui/components/skeleton";
import { cn } from "@x-game/ui/lib/utils";
import { useState } from "react";

import LeaderboardTable from "@/components/leaderboard/leaderboard-table";
import { authClient } from "@/lib/auth-client";
import {
	GAME_LIST,
	GAME_META,
	type GameId,
	THEMES,
	type Theme,
} from "@/lib/games";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/leaderboard")({
	component: LeaderboardRoute,
});

// memory-match chip labels live next to the leaderboard (the game itself
// owns the rest of theme presentation in `use-game-state`).
const THEME_CHIP_LABELS: Record<Theme, { emoji: string; label: string }> = {
	animals: { emoji: "🦊", label: "动物" },
	space: { emoji: "🚀", label: "太空" },
	food: { emoji: "🍣", label: "美食" },
	music: { emoji: "🎵", label: "音乐" },
	ocean: { emoji: "🌊", label: "海洋" },
	gems: { emoji: "💎", label: "宝石" },
	faces: { emoji: "😎", label: "表情" },
};

function LeaderboardRoute() {
	const { data: session } = authClient.useSession();
	const [activeGame, setActiveGame] = useState<GameId>(GAME_LIST[0].id);
	const [activeTheme, setActiveTheme] = useState<Theme | null>(null);

	const meta = GAME_META[activeGame];
	const showThemeTabs = meta.hasThemes;
	const themeForQuery = showThemeTabs ? (activeTheme ?? THEMES[0]) : undefined;

	const leaderboard = useQuery(
		trpc.leaderboard.list.queryOptions({
			gameId: activeGame,
			theme: themeForQuery,
			limit: 10,
		}),
	);

	return (
		<section>
			<div className="mb-8 flex items-end justify-between gap-4">
				<div>
					<p className="flex items-center gap-2 text-[#d9ff43] text-[10px] uppercase tracking-[0.25em]">
						<span className="h-1.5 w-1.5 rounded-full bg-[#d9ff43] shadow-[0_0_10px_#d9ff43]" />
						Ranked · Live
					</p>
					<h1 className="mt-3 font-black text-3xl tracking-[-0.04em] md:text-4xl">
						排行榜
					</h1>
					<p className="mt-2 max-w-xl text-sm text-white/42 leading-6">
						{`${meta.label} · ${meta.tagline} · 分数越高排名越靠前`}
					</p>
				</div>
				<div className="hidden items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-[10px] text-white/45 uppercase tracking-[0.18em] sm:flex">
					TOP {leaderboard.data?.items.length ?? 0}
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
									onClick={() => setActiveTheme(t)}
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

			{leaderboard.isLoading ? (
				<div className="space-y-2">
					{Array.from({ length: 5 }).map((_, idx) => (
						<Skeleton key={idx} className="h-12 w-full bg-white/5" />
					))}
				</div>
			) : leaderboard.error ? (
				<div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-10 text-center text-red-300 text-sm">
					加载排行榜失败
				</div>
			) : (
				<LeaderboardTable
					items={leaderboard.data?.items ?? []}
					me={leaderboard.data?.me ?? null}
					currentUserId={session?.user.id}
					showTheme={showThemeTabs}
				/>
			)}
		</section>
	);
}
