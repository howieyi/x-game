import { cn } from "@x-game/ui/lib/utils";

export interface StatBarProps {
	time: number;
	moves: number;
	bestLabel: string | null;
}

function fmtTime(s: number): string {
	const m = Math.floor(s / 60);
	const ss = s % 60;
	return `${m}:${ss.toString().padStart(2, "0")}`;
}

export default function StatBar({ time, moves, bestLabel }: StatBarProps) {
	return (
		<section className="stats" aria-label="游戏数据">
			<div className="stat">
				<span className="label">
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.4"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M12 8v4l3 2" />
						<circle cx="12" cy="12" r="9" />
					</svg>
					用时
				</span>
				<span className="value">{fmtTime(time)}</span>
			</div>
			<div className="stat">
				<span className="label">
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.4"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M4 12h16M4 6h16M4 18h10" />
					</svg>
					步数
				</span>
				<span className="value">{moves}</span>
			</div>
			<div className="stat">
				<span className="label">
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.4"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M12 2l2.39 6.95H22l-6.18 4.49 2.36 7.06L12 16.9l-6.18 3.6 2.36-7.06L2 8.95h7.61z" />
					</svg>
					最佳
				</span>
				<span className={cn("value", "small")}>{bestLabel ?? "—"}</span>
			</div>
		</section>
	);
}
