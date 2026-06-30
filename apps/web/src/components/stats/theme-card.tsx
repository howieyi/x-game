import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@x-game/ui/components/card";
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
				"block w-full text-left transition-colors",
				active && "ring-2 ring-primary",
			)}
		>
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<span aria-hidden="true">{meta.emoji}</span>
						<span>{meta.label}</span>
					</CardTitle>
				</CardHeader>
				<CardContent>
					<dl className="grid grid-cols-3 gap-2 text-xs">
						<div>
							<dt className="text-muted-foreground">总场次</dt>
							<dd className="font-medium">{total}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">最佳</dt>
							<dd className="font-medium">{best ? `${best.moves} 步` : "—"}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">三星次数</dt>
							<dd className="font-medium">{threeStarCount}</dd>
						</div>
					</dl>
					{best && (
						<p className="mt-2 text-muted-foreground text-xs">
							用时 {fmtTime(best.seconds)}
						</p>
					)}
				</CardContent>
			</Card>
		</Tag>
	);
}
