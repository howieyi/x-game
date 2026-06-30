import { cn } from "@x-game/ui/lib/utils";

export interface LeaderboardRecord {
	id: string;
	moves: number;
	seconds: number;
	stars: number;
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
}

function fmtTime(s: number): string {
	const m = Math.floor(s / 60);
	const ss = s % 60;
	return `${m}:${ss.toString().padStart(2, "0")}`;
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
}: LeaderboardTableProps) {
	const meIsInTop =
		Boolean(currentUserId) &&
		items.some((row) => row.user.id === currentUserId);

	if (items.length === 0) {
		return (
			<div className="rounded-2xl border border-white/10 border-dashed px-4 py-10 text-center text-sm text-white/40">
				暂无上榜记录
				<p className="mt-1 text-white/30 text-xs">去「游戏」页玩一局成为榜首吧</p>
			</div>
		);
	}

	return (
		<div className="space-y-3">
			<div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm">
				<table className="w-full text-sm">
					<thead className="text-white/40">
						<tr className="border-white/10 border-b">
							<th className="px-4 py-3 text-center font-medium">排名</th>
							<th className="px-4 py-3 text-left font-medium">玩家</th>
							<th className="px-4 py-3 text-right font-medium">步数</th>
							<th className="px-4 py-3 text-right font-medium">用时</th>
							<th className="px-4 py-3 text-right font-medium">达成时间</th>
						</tr>
					</thead>
					<tbody>
						{items.map((row) => {
							const isMe = row.user.id === currentUserId;
							return (
								<tr
									key={row.user.id}
									className={cn(
										"border-white/5 border-t text-white/80 transition-colors hover:bg-white/[0.04]",
										isMe && "bg-fuchsia-500/10 font-medium text-white",
									)}
								>
									<td className="px-4 py-3 text-center">
										<span
											className={cn(
												"inline-flex h-6 w-6 items-center justify-center rounded-full text-xs",
												row.rank === 1 && "bg-amber-400/20 text-amber-300",
												row.rank === 2 && "bg-slate-300/20 text-slate-200",
												row.rank === 3 && "bg-orange-400/20 text-orange-300",
												row.rank > 3 && "text-white/50",
											)}
										>
											{row.rank}
										</span>
									</td>
									<td className="px-4 py-3">
										<span>{row.user.name || "匿名"}</span>
										{isMe && (
											<span className="ml-2 rounded-full bg-fuchsia-500/20 px-1.5 py-0.5 text-fuchsia-200 text-xs">
												你
											</span>
										)}
									</td>
									<td className="px-4 py-3 text-right text-white">
										{row.record.moves}
									</td>
									<td className="px-4 py-3 text-right">
										{fmtTime(row.record.seconds)}
									</td>
									<td className="px-4 py-3 text-right text-white/40">
										{fmtDate(row.record.createdAt)}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
			{me && !meIsInTop && (
				<div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/80">
					<span className="font-medium text-white">你的最佳：</span>第 {me.rank}{" "}
					名（{me.record.moves} 步 / {fmtTime(me.record.seconds)}）
				</div>
			)}
		</div>
	);
}
