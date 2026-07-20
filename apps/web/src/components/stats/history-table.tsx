import type { GameId } from "@x-game/db/schema/game";
import { Button } from "@x-game/ui/components/button";
import { cn } from "@x-game/ui/lib/utils";

export interface HistoryRecord {
	id: string;
	gameId: GameId;
	score: number;
	theme?: string | null;
	moves?: number | null;
	seconds?: number | null;
	stars?: number | null;
	durationSeconds?: number | null;
	isNewBest: boolean | null;
	createdAt: Date | string;
}

export interface HistoryTableProps {
	items: HistoryRecord[];
	total: number;
	pageCount: number;
	page: number;
	onPageChange: (page: number) => void;
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
	const yyyy = d.getFullYear();
	const mm = String(d.getMonth() + 1).padStart(2, "0");
	const dd = String(d.getDate()).padStart(2, "0");
	const hh = String(d.getHours()).padStart(2, "0");
	const mi = String(d.getMinutes()).padStart(2, "0");
	return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

export default function HistoryTable({
	items,
	total,
	pageCount,
	page,
	onPageChange,
}: HistoryTableProps) {
	// memory-match keeps a stars column; every other game hides it.
	const showStars = items[0]?.gameId === "memory-match";

	if (items.length === 0) {
		return (
			<div className="rounded-2xl border border-white/[0.07] border-dashed bg-white/[0.015] px-4 py-14 text-center">
				<p className="text-[10px] text-white/30 uppercase tracking-[0.22em]">
					No runs yet
				</p>
				<p className="mt-3 text-sm text-white/55">还没有战绩</p>
				<p className="mt-1 text-white/30 text-xs">去玩一局吧</p>
			</div>
		);
	}

	const hasPrev = page > 0;
	const hasNext = page + 1 < pageCount;

	return (
		<div className="space-y-3">
			<div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025]">
				<table className="w-full text-sm">
					<thead>
						<tr className="border-white/[0.07] border-b">
							<th className="px-4 py-3 text-left font-medium text-[10px] text-white/40 uppercase tracking-[0.22em]">
								时间
							</th>
							<th className="px-4 py-3 text-right font-medium text-[10px] text-white/40 uppercase tracking-[0.22em]">
								分数
							</th>
							<th className="px-4 py-3 text-right font-medium text-[10px] text-white/40 uppercase tracking-[0.22em]">
								用时
							</th>
							{showStars && (
								<th className="px-4 py-3 text-center font-medium text-[10px] text-white/40 uppercase tracking-[0.22em]">
									星级
								</th>
							)}
							<th className="px-4 py-3 text-center font-medium text-[10px] text-white/40 uppercase tracking-[0.22em]">
								记录
							</th>
						</tr>
					</thead>
					<tbody>
						{items.map((record) => (
							<tr
								key={record.id}
								className="border-white/[0.04] border-t text-white/80 transition-colors hover:bg-white/[0.03]"
							>
								<td className="px-4 py-3 font-mono text-white/55 text-xs tabular-nums">
									{fmtDate(record.createdAt)}
								</td>
								<td className="px-4 py-3 text-right font-mono text-white tabular-nums">
									{fmtScore(record.score)}
								</td>
								<td className="px-4 py-3 text-right font-mono text-white/70 tabular-nums">
									{fmtTime(record.durationSeconds ?? record.seconds)}
								</td>
								{showStars && (
									<td
										className="px-4 py-3 text-center"
										aria-label={`${record.stars ?? 0} 星`}
									>
										<span className="inline-flex gap-0.5">
											{[1, 2, 3].map((i) => (
												<span
													key={i}
													aria-hidden="true"
													className={cn(
														"inline-block h-1.5 w-1.5 rounded-full",
														i <= (record.stars ?? 0)
															? "bg-amber-400"
															: "bg-white/15",
													)}
												/>
											))}
										</span>
									</td>
								)}
								<td className="px-4 py-3 text-center">
									{record.isNewBest ? (
										<span className="inline-flex items-center gap-1 rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 font-medium text-[10px] text-amber-300 uppercase tracking-[0.12em]">
											NEW BEST
										</span>
									) : (
										<span className="text-white/25 text-xs">—</span>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<div className="flex items-center justify-between rounded-full border border-white/[0.07] bg-white/[0.025] px-4 py-2 text-xs">
				<span className="text-white/40">
					共 <span className="text-white/70 tabular-nums">{total}</span> 条 · 第{" "}
					<span className="text-white/70 tabular-nums">{page + 1}</span> /{" "}
					<span className="text-white/70 tabular-nums">{pageCount}</span> 页
				</span>
				<div className="flex gap-1.5">
					<Button
						variant="outline"
						size="sm"
						className="border-white/[0.07] bg-white/[0.03] text-white/55 hover:bg-white/[0.06] hover:text-white disabled:opacity-30"
						disabled={!hasPrev}
						onClick={() => onPageChange(Math.max(0, page - 1))}
					>
						上一页
					</Button>
					<Button
						variant="outline"
						size="sm"
						className="border-white/[0.07] bg-white/[0.03] text-white/55 hover:bg-white/[0.06] hover:text-white disabled:opacity-30"
						disabled={!hasNext}
						onClick={() => onPageChange(Math.min(pageCount - 1, page + 1))}
					>
						下一页
					</Button>
				</div>
			</div>
		</div>
	);
}
