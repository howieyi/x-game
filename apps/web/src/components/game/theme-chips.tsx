import { cn } from "@x-game/ui/lib/utils";

export interface ThemeChipsProps {
	themes: readonly string[];
	active: string;
	onSelect: (t: string) => void;
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

export default function ThemeChips({
	themes,
	active,
	onSelect,
}: ThemeChipsProps) {
	return (
		<div
			className="flex flex-wrap justify-center gap-2"
			role="tablist"
			aria-label="主题"
		>
			{themes.map((t) => {
				const isActive = t === active;
				return (
					<button
						key={t}
						type="button"
						role="tab"
						aria-selected={isActive}
						data-theme={t}
						onClick={() => onSelect(t)}
						className={cn(
							"inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition",
							isActive
								? "bg-cyan-300 font-bold text-black"
								: "border border-white/[0.06] bg-white/[0.02] text-white/55 hover:border-white/15 hover:text-white",
						)}
					>
						{CHIP_LABELS[t] ?? t}
					</button>
				);
			})}
		</div>
	);
}
