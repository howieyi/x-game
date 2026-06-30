import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@x-game/ui/components/skeleton";
import { useState } from "react";

import HistoryTable from "@/components/stats/history-table";
import ThemeCard from "@/components/stats/theme-card";
import PageShell from "@/components/page-shell";
import { THEME_KEYS, type Theme } from "@/hooks/use-game-state";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/stats")({
	component: StatsRoute,
});

function StatsRoute() {
	const myBest = useQuery(trpc.game.myBest.queryOptions({}));

	const [activeTheme, setActiveTheme] = useState<Theme | null>(null);

	type Aggregate = {
		theme: Theme;
		best: { moves: number; seconds: number } | null;
		total: number;
		threeStarCount: number;
	};

	const aggregates: Aggregate[] | null = (() => {
		const data = myBest.data;
		if (!data || !Array.isArray(data)) return null;
		return data as Aggregate[];
	})();

	const resolvedTheme: Theme = (() => {
		if (activeTheme) return activeTheme;
		if (!aggregates) return "animals";
		const firstWithGames = aggregates.find((row) => row.total > 0);
		return firstWithGames?.theme ?? "animals";
	})();

	const history = useQuery(
		trpc.game.myHistory.queryOptions({
			theme: resolvedTheme,
			page: 0,
			limit: 20,
		}),
	);

	return (
		<PageShell
			title="我的战绩"
			subtitle="查看每个主题的累计战绩与最近对局记录"
		>
			<section aria-label="主题总览" className="mb-8">
				<h2 className="mb-3 font-medium text-lg text-white/90">主题总览</h2>
				{myBest.isLoading ? (
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{THEME_KEYS.map((t) => (
							<Skeleton key={t} className="h-32 w-full bg-white/5" />
						))}
					</div>
				) : (
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{THEME_KEYS.map((t) => {
							const row = aggregates?.find((r) => r.theme === t);
							return (
								<ThemeCard
									key={t}
									theme={t}
									best={
										row?.best
											? { moves: row.best.moves, seconds: row.best.seconds }
											: null
									}
									total={row?.total ?? 0}
									threeStarCount={row?.threeStarCount ?? 0}
									active={t === resolvedTheme}
									onClick={() => setActiveTheme(t)}
								/>
							);
						})}
					</div>
				)}
			</section>

			<section aria-label="历史记录">
				<h2 className="mb-3 font-medium text-lg text-white/90">
					历史记录{" "}
					<span className="text-sm text-white/40">· {resolvedTheme}</span>
				</h2>
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
						onPageChange={() => {
							// 当前实现只读第 0 页；分页入口预留
						}}
					/>
				)}
			</section>
		</PageShell>
	);
}
