import { cn } from "@x-game/ui/lib/utils";

import type { Theme } from "@/hooks/use-game-state";

export interface ThemeCardBest {
	moves: number;
	seconds: number;
}

export interface ThemeCardProps {
	theme: Theme;
	best: ThemeCardBest | null;
	total: number;
	threeStarCount: number;
	onClick?: () => void;
	active?: boolean;
}

const THEME_LABELS: Record<Theme, { emoji: string; label: string }> = {
	animals: { emoji: "🦊", label: "动物" },
	space: { emoji: "🚀", label: "太空" },
	food: { emoji: "🍣", label: "美食" },
	music: { emoji: "🎵", label: "音乐" },
	ocean: { emoji: "🌊", label: "海洋" },
	gems: { emoji: "💎", label: "宝石" },
	faces: { emoji: "😎", label: "表情" },
};

function fmtTime(s: number): string {
	const m = Math.floor(s / 60);
	const ss = s % 60;
	return `${m}:${ss.toString().padStart(2, "0")}`;
}

export default function ThemeCard({
	theme,
	best,
	total,
	threeStarCount,
	onClick,
	active,
}: ThemeCardProps) {
	const meta = THEME_LABELS[theme];
	const interactive = Boolean(onClick);

	const Tag = interactive ? "button" : "div";

	return (
		<Tag
			type={interactive ? "button" : undefined}
			onClick={onClick}
			className={cn(
				"block w-full rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left backdrop-blur-sm transition-all",
				interactive && "hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06]",
				active && "border-fuchsia-400/60 bg-fuchsia-500/10 ring-1 ring-fuchsia-400/40",
			)}
		>
			<div className="mb-3 flex items-center gap-2 font-semibold text-base text-white">
				<span aria-hidden="true" className="text-xl">
					{meta.emoji}
				</span>
				<span>{meta.label}</span>
			</div>
			<dl className="grid grid-cols-3 gap-2 text-xs">
				<div>
					<dt className="text-white/40">总场次</dt>
					<dd className="mt-0.5 font-semibold text-sm text-white">{total}</dd>
				</div>
				<div>
					<dt className="text-white/40">最佳</dt>
					<dd className="mt-0.5 font-semibold text-sm text-white">
						{best ? `${best.moves} 步` : "—"}
					</dd>
				</div>
				<div>
					<dt className="text-white/40">三星次数</dt>
					<dd className="mt-0.5 font-semibold text-sm text-white">
						{threeStarCount}
					</dd>
				</div>
			</dl>
			{best && (
				<p className="mt-3 text-white/40 text-xs">
					用时 {fmtTime(best.seconds)}
				</p>
			)}
		</Tag>
	);
}
