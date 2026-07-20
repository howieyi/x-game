import { cn } from "@x-game/ui/lib/utils";

export interface SegmentedOption<T extends string | number> {
	value: T;
	label: string;
}

export interface SegmentedControlProps<T extends string | number> {
	options: ReadonlyArray<SegmentedOption<T>>;
	value: T;
	onChange: (value: T) => void;
	// When true, the active option stays at the platform's accent colour
	// (cyan-300). Pass `false` to use a neutral white active swatch.
	accent?: boolean;
	// Optional aria-label applied to the underlying group.
	label?: string;
}

/**
 * Compact, iOS-style segmented selector. Designed to live in a console
 * top-bar `rightSlot` so per-page filters don't crowd the hero region.
 *
 * Uses a button + aria-pressed toggle group instead of a radiogroup so the
 * styles stay predictable across browsers and the role-free markup passes
 * Biome's a11y rules.
 */
export default function SegmentedControl<T extends string | number>({
	options,
	value,
	onChange,
	accent = true,
	label,
}: SegmentedControlProps<T>) {
	const activeClass = accent ? "bg-cyan-300 text-black" : "bg-white text-black";

	return (
		<fieldset
			aria-label={label}
			className="inline-flex items-center gap-0.5 rounded-full border border-white/[0.07] bg-white/[0.025] p-0.5"
		>
			{options.map((opt) => {
				const isActive = opt.value === value;
				return (
					<button
						key={String(opt.value)}
						type="button"
						aria-pressed={isActive}
						onClick={() => onChange(opt.value)}
						className={cn(
							"rounded-full px-3 py-1.5 text-[11px] tracking-[0.04em] transition",
							isActive
								? `${activeClass} font-bold`
								: "text-white/55 hover:text-white",
						)}
					>
						{opt.label}
					</button>
				);
			})}
		</fieldset>
	);
}
