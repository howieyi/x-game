import type { GameId } from "@x-game/db/schema/game";
import { cn } from "@x-game/ui/lib/utils";

// Generic record shape returned by `leaderboard.list` and `game.myHistory`.
// `score` is the universal ranking field; `durationSeconds` is derived from
// each game's metrics blob on the server so the client doesn't need to know
// per-game shapes. `moves` / `seconds` / `stars` remain populated only for
// memory-match (legacy columns), so the table falls back to `—` elsewhere.
export interface LeaderboardRecord {
	id: string;
	gameId: GameId;
	score: number;
	theme?: string | null;
	moves?: number | null;
	seconds?: number | null;
	stars?: number | null;
	durationSeconds?: number | null;
	isNewBest?: boolean | null;
	createdAt: Date | string;
}

export interface LeaderboardUser {
	id: string;
	name: string;
}

export interface LeaderboardRow {
	rank: number;
	user: LeaderboardUser;
	record: LeaderboardRecord;
}

export interface LeaderboardTableProps {
	items: LeaderboardRow[];
	me?: LeaderboardRow | null;
	currentUserId?: string;
	// memory-match shows theme as a column for context; other games hide it.
	showTheme?: boolean;
}

function fmtTime(s: number | null | undefined): string {
	if (typeof s !== "number" || !Number.isFinite(s)) return "—";
	const m = Math.floor(s / 60);
	const ss = s % 60;
	return `${m}:${ss.toString().padStart(2, "0")}`;
}

function fmtScore(score: number): string {
	return score.toLocaleString("en-US");
}

function fmtDate(value: Date | string): string {
	const d = typeof value === "string" ? new Date(value) : value;
	if (Number.isNaN(d.getTime())) return "—";
	const mm = String(d.getMonth() + 1).padStart(2, "0");
	const dd = String(d.getDate()).padStart(2, "0");
	return `${mm}-${dd}`;
}

export default function LeaderboardTable({
	items,
	me,
	currentUserId,
	showTheme = false,
}: LeaderboardTableProps) {
	const meIsInTop =
		Boolean(currentUserId) &&
		items.some((row) => row.user.id === currentUserId);

	if (items.length === 0) {
		return (
			<div className="rounded-2xl border border-white/[0.07] border-dashed bg-white/[0.015] px-4 py-14 text-center">
				<p className="text-[10px] text-white/30 uppercase tracking-[0.22em]">
					No records
				</p>
				<p className="mt-3 text-sm text-white/55">暂无上榜记录</p>
				<p className="mt-1 text-white/30 text-xs">
					去「游戏」页玩一局成为榜首吧
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-3">
			<div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025]">
				<table className="w-full text-sm">
					<thead>
						<tr className="border-white/[0.07] border-b">
							<th className="px-4 py-3 text-center font-medium text-[10px] text-white/40 uppercase tracking-[0.22em]">
								排名
							</th>
							<th className="px-4 py-3 text-left font-medium text-[10px] text-white/40 uppercase tracking-[0.22em]">
								玩家
							</th>
							<th className="px-4 py-3 text-right font-medium text-[10px] text-white/40 uppercase tracking-[0.22em]">
								分数
							</th>
							<th className="px-4 py-3 text-right font-medium text-[10px] text-white/40 uppercase tracking-[0.22em]">
								用时
							</th>
							{showTheme && (
								<th className="px-4 py-3 text-right font-medium text-[10px] text-white/40 uppercase tracking-[0.22em]">
									主题
								</th>
							)}
							<th className="px-4 py-3 text-right font-medium text-[10px] text-white/40 uppercase tracking-[0.22em]">
								达成
							</th>
						</tr>
					</thead>
					<tbody>
						{items.map((row) => {
							const isMe = row.user.id === currentUserId;
							return (
								<tr
									key={row.user.id}
									className={cn(
										"border-white/[0.04] border-t text-white/80 transition-colors hover:bg-white/[0.03]",
										isMe && "bg-cyan-300/[0.07] font-medium text-white",
									)}
								>
									<td className="px-4 py-3 text-center">
										<span
											className={cn(
												"inline-flex h-7 w-7 items-center justify-center rounded-full font-mono text-xs",
												row.rank === 1 &&
													"bg-amber-400/15 text-amber-300 ring-1 ring-amber-300/30",
												row.rank === 2 &&
													"bg-slate-300/15 text-slate-200 ring-1 ring-slate-300/25",
												row.rank === 3 &&
													"bg-orange-400/15 text-orange-300 ring-1 ring-orange-300/25",
												row.rank > 3 && "text-white/45",
											)}
										>
											{row.rank}
										</span>
									</td>
									<td className="px-4 py-3">
										<div className="flex items-center gap-2">
											<span className="truncate">
												{row.user.name || "匿名"}
											</span>
											{isMe && (
												<span className="rounded-full bg-cyan-300/15 px-1.5 py-0.5 text-[10px] text-cyan-200">
													YOU
												</span>
											)}
										</div>
									</td>
									<td className="px-4 py-3 text-right font-mono text-white tabular-nums">
										{fmtScore(row.record.score)}
									</td>
									<td className="px-4 py-3 text-right font-mono text-white/70 tabular-nums">
										{fmtTime(row.record.durationSeconds ?? row.record.seconds)}
									</td>
									{showTheme && (
										<td className="px-4 py-3 text-right text-white/55 text-xs">
											{row.record.theme ?? "—"}
										</td>
									)}
									<td className="px-4 py-3 text-right text-white/35 text-xs">
										{fmtDate(row.record.createdAt)}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
			{me && !meIsInTop && (
				<div className="flex items-center justify-between rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.05] px-4 py-3 text-sm">
					<span className="text-white/65">你的最佳</span>
					<span className="font-medium text-white">
						第 {me.rank} 名 ·{" "}
						<span className="font-mono">{fmtScore(me.record.score)}</span> 分 /{" "}
						<span className="font-mono">
							{fmtTime(me.record.durationSeconds ?? me.record.seconds)}
						</span>
					</span>
				</div>
			)}
		</div>
	);
}
