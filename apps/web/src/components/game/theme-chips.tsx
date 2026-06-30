import { cn } from "@x-game/ui/lib/utils";

export interface ThemeChipsProps {
	themes: readonly string[];
	active: string;
	onSelect: (t: string) => void;
}

export default function ThemeChips({
	themes,
	active,
	onSelect,
}: ThemeChipsProps) {
	return (
		<div className="themes" role="tablist" aria-label="主题">
			{themes.map((t) => (
				<button
					key={t}
					type="button"
					className={cn("chip", t === active && "active")}
					data-theme={t}
					role="tab"
					aria-selected={t === active}
					onClick={() => onSelect(t)}
				>
					{CHIP_LABELS[t] ?? t}
				</button>
			))}
		</div>
	);
}

const CHIP_LABELS: Record<string, string> = {
	animals: "🦊 动物",
	space: "🚀 太空",
	food: "🍣 美食",
	music: "🎵 音乐",
	ocean: "🌊 海洋",
	gems: "💎 宝石",
	faces: "😎 表情",
};
