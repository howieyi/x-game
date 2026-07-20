import { cn } from "@x-game/ui/lib/utils";

export interface ThemeCardBest {
	score: number;
	durationSeconds?: number | null;
}

export interface ThemeCardProps {
	// Generic across platform games. `label` and `emoji` are looked up by the
	// parent from `GAME_META` so this component stays purely presentational.
	gameId: string;
	label: string;
	emoji: string;
	best: ThemeCardBest | null;
	total: number;
	onClick?: () => void;
	active?: boolean;
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

export default function ThemeCard({
	label,
	emoji,
	best,
	total,
	onClick,
	active,
}: ThemeCardProps) {
	const interactive = Boolean(onClick);
	const Tag = interactive ? "button" : "div";

	return (
		<Tag
			type={interactive ? "button" : undefined}
			onClick={onClick}
			className={cn(
				"relative w-full overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] p-6 text-left transition-all",
				interactive &&
					"hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.04]",
				active && "ring-1 ring-cyan-300/35",
			)}
		>
			{/* accent glow */}
			<span
				aria-hidden="true"
				className="pointer-events-none absolute -top-20 -right-12 h-40 w-40 rounded-full bg-cyan-400/15 blur-3xl"
			/>

			<div className="relative flex items-center gap-3">
				<span
					aria-hidden="true"
					className="grid h-12 w-12 place-items-center rounded-xl border border-white/10 bg-black/30 text-2xl"
				>
					{emoji}
				</span>
				<div>
					<p className="text-[10px] text-white/30 uppercase tracking-[0.2em]">
						Game best
					</p>
					<h3 className="mt-1 font-bold text-lg">{label}</h3>
				</div>
			</div>

			<div className="relative mt-6 grid grid-cols-3 gap-4 border-white/[0.05] border-t pt-5">
				<div>
					<p className="text-[10px] text-white/30 uppercase tracking-[0.2em]">
						总场次
					</p>
					<p className="mt-1 font-black text-2xl text-white tabular-nums">
						{total}
					</p>
				</div>
				<div>
					<p className="text-[10px] text-white/30 uppercase tracking-[0.2em]">
						最高分
					</p>
					<p className="mt-1 font-black text-2xl text-white tabular-nums">
						{best ? fmtScore(best.score) : "—"}
					</p>
				</div>
				<div>
					<p className="text-[10px] text-white/30 uppercase tracking-[0.2em]">
						用时
					</p>
					<p className="mt-1 font-mono text-white/85 text-xl tabular-nums">
						{fmtTime(best?.durationSeconds)}
					</p>
				</div>
			</div>
		</Tag>
	);
}
