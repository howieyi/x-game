import type { LucideIcon } from "lucide-react";
import { Clock, Layers, Star } from "lucide-react";

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

interface MetricProps {
	Icon: LucideIcon;
	label: string;
	value: string;
	tone: "cyan" | "violet" | "amber";
}

const TONE_CLASSES: Record<MetricProps["tone"], string> = {
	cyan: "text-cyan-300",
	violet: "text-violet-300",
	amber: "text-amber-300",
};

function Metric({ Icon, label, value, tone }: MetricProps) {
	return (
		<div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
			<span
				aria-hidden
				className={`pointer-events-none absolute -top-8 -right-8 h-20 w-20 rounded-full bg-gradient-to-br ${tone === "cyan" ? "from-cyan-400/15" : tone === "violet" ? "from-violet-400/15" : "from-amber-400/15"} to-transparent opacity-70 blur-2xl`}
			/>
			<div className="relative">
				<div className="flex items-center justify-between">
					<Icon className={TONE_CLASSES[tone]} size={15} />
					<span className="text-[10px] text-white/30 uppercase tracking-[0.2em]">
						{label}
					</span>
				</div>
				<p className="mt-3 font-black text-2xl text-white tabular-nums">
					{value}
				</p>
			</div>
		</div>
	);
}

export default function StatBar({ time, moves, bestLabel }: StatBarProps) {
	return (
		<section aria-label="游戏数据" className="grid grid-cols-3 gap-3 sm:gap-4">
			<Metric Icon={Clock} label="用时" value={fmtTime(time)} tone="cyan" />
			<Metric Icon={Layers} label="步数" value={String(moves)} tone="violet" />
			<Metric Icon={Star} label="最佳" value={bestLabel ?? "—"} tone="amber" />
		</section>
	);
}
