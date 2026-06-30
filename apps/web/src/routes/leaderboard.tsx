import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@x-game/ui/components/skeleton";
import { cn } from "@x-game/ui/lib/utils";
import { useState } from "react";

import LeaderboardTable from "@/components/leaderboard/leaderboard-table";
import { THEME_KEYS, type Theme } from "@/hooks/use-game-state";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/leaderboard")({
	component: LeaderboardRoute,
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
		<div className="container mx-auto max-w-3xl px-4 py-6">
			<header className="mb-6">
				<h1 className="font-semibold text-2xl">排行榜</h1>
				<p className="text-muted-foreground text-sm">
					每个主题的最速传说 · 排名按步数与用时综合排序
				</p>
			</header>

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
								"rounded-full border px-3 py-1 text-sm transition-colors",
								isActive
									? "border-primary bg-primary text-primary-foreground"
									: "bg-background hover:bg-muted",
							)}
						>
							<span aria-hidden="true">{meta.emoji}</span> {meta.label}
						</button>
					);
				})}
			</div>

			{leaderboard.isLoading ? (
				<div className="space-y-2">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			) : leaderboard.error ? (
				<div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-6 text-center text-destructive text-sm">
					加载排行榜失败
				</div>
			) : (
				<LeaderboardTable
					items={leaderboard.data?.items ?? []}
					me={leaderboard.data?.me ?? null}
					currentUserId={session?.user.id}
				/>
			)}
		</div>
	);
}
