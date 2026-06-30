import { Button } from "@x-game/ui/components/button";
import { cn } from "@x-game/ui/lib/utils";

export interface HistoryRecord {
	id: string;
	theme: string;
	moves: number;
	seconds: number;
	stars: number;
	isNewBest: boolean;
	createdAt: Date | string;
}

export interface HistoryTableProps {
	items: HistoryRecord[];
	total: number;
	pageCount: number;
	page: number;
	onPageChange: (page: number) => void;
}

function fmtTime(s: number): string {
	const m = Math.floor(s / 60);
	const ss = s % 60;
	return `${m}:${ss.toString().padStart(2, "0")}`;
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
	if (items.length === 0) {
		return (
			<div className="rounded-md border border-dashed px-4 py-10 text-center text-muted-foreground text-sm">
				还没有战绩，去玩一局吧
			</div>
		);
	}

	const hasPrev = page > 0;
	const hasNext = page + 1 < pageCount;

	return (
		<div className="space-y-3">
			<div className="overflow-x-auto rounded-md border">
				<table className="w-full text-sm">
					<thead className="bg-muted/40 text-muted-foreground">
						<tr>
							<th className="px-3 py-2 text-left font-medium">时间</th>
							<th className="px-3 py-2 text-right font-medium">步数</th>
							<th className="px-3 py-2 text-right font-medium">用时</th>
							<th className="px-3 py-2 text-center font-medium">星级</th>
							<th className="px-3 py-2 text-center font-medium">是否新纪录</th>
						</tr>
					</thead>
					<tbody>
						{items.map((record) => (
							<tr
								key={record.id}
								className="border-t transition-colors hover:bg-muted/30"
							>
								<td className="px-3 py-2 text-muted-foreground">
									{fmtDate(record.createdAt)}
								</td>
								<td className="px-3 py-2 text-right font-medium">
									{record.moves}
								</td>
								<td className="px-3 py-2 text-right">
									{fmtTime(record.seconds)}
								</td>
								<td
									className="px-3 py-2 text-center"
									aria-label={`${record.stars} 星`}
								>
									<span className="inline-flex gap-0.5">
										{[1, 2, 3].map((i) => (
											<span
												key={i}
												aria-hidden="true"
												className={cn(
													"inline-block h-2 w-2 rounded-full",
													i <= record.stars
														? "bg-amber-400"
														: "bg-muted-foreground/30",
												)}
											/>
										))}
									</span>
								</td>
								<td className="px-3 py-2 text-center">
									{record.isNewBest ? (
										<span className="inline-flex items-center rounded-sm bg-amber-400/15 px-2 py-0.5 font-medium text-amber-600 text-xs dark:text-amber-300">
											新纪录
										</span>
									) : (
										<span className="text-muted-foreground">—</span>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<div className="flex items-center justify-between text-xs">
				<span className="text-muted-foreground">
					共 {total} 条 · 第 {page + 1} / {pageCount} 页
				</span>
				<div className="flex gap-2">
					<Button
						variant="outline"
						size="sm"
						disabled={!hasPrev}
						onClick={() => onPageChange(Math.max(0, page - 1))}
					>
						上一页
					</Button>
					<Button
						variant="outline"
						size="sm"
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
