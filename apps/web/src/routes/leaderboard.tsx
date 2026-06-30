import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@x-game/ui/components/skeleton";
import { cn } from "@x-game/ui/lib/utils";
import { useState } from "react";

import LeaderboardTable from "@/components/leaderboard/leaderboard-table";
import PageShell from "@/components/page-shell";
import { THEME_KEYS, type Theme } from "@/hooks/use-game-state";
import { authClient } from "@/lib/auth-client";
import { requireAuth } from "@/lib/require-auth";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/leaderboard")({
	component: LeaderboardRoute,
	beforeLoad: requireAuth,
});

const CHIP_LABELS: Record<Theme, { emoji: string; label: string }> = {
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
	const [activeTheme, setActiveTheme] = useState<Theme>("animals");

	const leaderboard = useQuery(
		trpc.leaderboard.list.queryOptions({
			theme: activeTheme,
			limit: 10,
		}),
	);

	return (
		<PageShell
			title="排行榜"
			subtitle="每个主题的最速传说 · 排名按步数与用时综合排序"
			maxWidth="3xl"
		>
			<div
				className="mb-4 flex flex-wrap gap-2"
				role="tablist"
				aria-label="主题"
			>
				{THEME_KEYS.map((t) => {
					const meta = CHIP_LABELS[t];
					const isActive = t === activeTheme;
					return (
						<button
							key={t}
							type="button"
							role="tab"
							aria-selected={isActive}
							onClick={() => setActiveTheme(t)}
							className={cn(
								"rounded-full border px-3 py-1 text-sm transition-all",
								isActive
									? "border-transparent bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white shadow-lg shadow-fuchsia-500/20"
									: "border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white",
							)}
						>
							<span aria-hidden="true">{meta.emoji}</span> {meta.label}
						</button>
					);
				})}
			</div>

			{leaderboard.isLoading ? (
				<div className="space-y-2">
					<Skeleton className="h-10 w-full bg-white/5" />
					<Skeleton className="h-10 w-full bg-white/5" />
					<Skeleton className="h-10 w-full bg-white/5" />
					<Skeleton className="h-10 w-full bg-white/5" />
					<Skeleton className="h-10 w-full bg-white/5" />
				</div>
			) : leaderboard.error ? (
				<div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-6 text-center text-red-300 text-sm">
					加载排行榜失败
				</div>
			) : (
				<LeaderboardTable
					items={leaderboard.data?.items ?? []}
					me={leaderboard.data?.me ?? null}
					currentUserId={session?.user.id}
				/>
			)}
		</PageShell>
	);
}
