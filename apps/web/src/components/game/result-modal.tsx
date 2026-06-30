import { Button } from "@x-game/ui/components/button";
import { cn } from "@x-game/ui/lib/utils";
import type { ReactNode } from "react";

export interface ResultModalProps {
	open: boolean;
	time: number;
	moves: number;
	stars: 1 | 2 | 3;
	bestBadge: ReactNode | null;
	onPlayAgain: () => void;
	footer?: ReactNode;
}

function fmtTime(s: number): string {
	const m = Math.floor(s / 60);
	const ss = s % 60;
	return `${m}:${ss.toString().padStart(2, "0")}`;
}

export default function ResultModal({
	open,
	time,
	moves,
	stars,
	bestBadge,
	onPlayAgain,
	footer,
}: ResultModalProps) {
	return (
		<div
			className={cn("modal-mask", open && "show")}
			role="dialog"
			aria-modal="true"
			aria-labelledby="modalTitle"
		>
			<div className="modal">
				<h2 id="modalTitle">太厉害啦！</h2>
				<p>全部 8 对都找齐了</p>
				<div className="stars">
					<div className={cn("star", stars >= 1 && "on")} />
					<div className={cn("star", stars >= 2 && "on")} />
					<div className={cn("star", stars >= 3 && "on")} />
				</div>
				<div className="result-grid">
					<div className="stat">
						<span className="label">用时</span>
						<span className="value">{fmtTime(time)}</span>
					</div>
					<div className="stat">
						<span className="label">步数</span>
						<span className="value">{moves}</span>
					</div>
				</div>
				{bestBadge}
				<Button
					type="button"
					onClick={onPlayAgain}
					className="w-full"
					style={{ width: "100%" }}
				>
					再来一局
				</Button>
				{footer}
			</div>
		</div>
	);
}
