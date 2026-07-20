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
			className={cn(
				"fixed inset-0 z-50 flex items-center justify-center bg-[#05070a]/80 p-4 backdrop-blur-md transition-opacity",
				open
					? "pointer-events-auto opacity-100"
					: "pointer-events-none opacity-0",
			)}
			role="dialog"
			aria-modal="true"
			aria-labelledby="modalTitle"
		>
			<div
				className={cn(
					"relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] p-7 transition-transform",
					open ? "scale-100" : "scale-95",
				)}
			>
				<span
					aria-hidden
					className="pointer-events-none absolute -top-20 left-1/2 h-48 w-72 -translate-x-1/2 rounded-full bg-gradient-to-br from-cyan-400/15 via-violet-400/10 to-transparent blur-3xl"
				/>
				<div className="relative">
					<p className="flex items-center gap-2 text-[#d9ff43] text-[10px] uppercase tracking-[0.25em]">
						<span className="h-1.5 w-1.5 rounded-full bg-[#d9ff43] shadow-[0_0_10px_#d9ff43]" />
						Round complete
					</p>
					<h2
						id="modalTitle"
						className="mt-2 font-black text-3xl tracking-[-0.04em]"
					>
						太厉害啦！
					</h2>
					<p className="mt-1.5 text-sm text-white/45">全部 8 对都找齐了</p>

					<div className="mt-6 flex items-center justify-center gap-2">
						{[1, 2, 3].map((i) => (
							<span
								key={i}
								aria-hidden
								className={cn(
									"inline-block h-7 w-7 transition",
									i <= stars
										? "bg-gradient-to-br from-amber-300 to-orange-500 [clip-path:polygon(50%_0%,61%_35%,98%_35%,68%_57%,79%_91%,50%_70%,21%_91%,32%_57%,2%_35%,39%_35%)]"
										: "bg-white/10 [clip-path:polygon(50%_0%,61%_35%,98%_35%,68%_57%,79%_91%,50%_70%,21%_91%,32%_57%,2%_35%,39%_35%)]",
								)}
							/>
						))}
					</div>

					<div className="mt-6 grid grid-cols-2 gap-3">
						<div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
							<p className="text-[10px] text-white/35 uppercase tracking-[0.2em]">
								用时
							</p>
							<p className="mt-1 font-black text-white text-xl tabular-nums">
								{fmtTime(time)}
							</p>
						</div>
						<div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
							<p className="text-[10px] text-white/35 uppercase tracking-[0.2em]">
								步数
							</p>
							<p className="mt-1 font-black text-white text-xl tabular-nums">
								{moves}
							</p>
						</div>
					</div>

					{bestBadge && (
						<div className="mt-4 flex justify-center">{bestBadge}</div>
					)}

					<Button
						type="button"
						onClick={onPlayAgain}
						className="mt-6 w-full bg-[#d9ff43] font-bold text-black shadow-[0_0_24px_rgba(217,255,67,0.35)] transition hover:bg-[#c4f02e]"
					>
						再来一局
					</Button>
					{footer && <div className="mt-4">{footer}</div>}
				</div>
			</div>
		</div>
	);
}
