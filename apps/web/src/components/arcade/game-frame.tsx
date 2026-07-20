import { Link } from "@tanstack/react-router";
import { ArrowLeft, Gamepad2 } from "lucide-react";
import type { ReactNode } from "react";

export function GameFrame({
	eyebrow,
	title,
	description,
	color,
	controls = "WASD / 方向键 · 空格",
	children,
}: {
	eyebrow: string;
	title: string;
	description: string;
	color: "cyan" | "violet";
	controls?: string;
	children: ReactNode;
}) {
	// 主题色 token 集中管理
	const tone = {
		dot: color === "cyan" ? "bg-cyan-300" : "bg-violet-300",
		text: color === "cyan" ? "text-cyan-300" : "text-violet-300",
		chip:
			color === "cyan"
				? "border-cyan-300/25 bg-cyan-300/8"
				: "border-violet-300/25 bg-violet-300/8",
		glow: color === "cyan" ? "bg-cyan-400/10" : "bg-violet-400/10",
		bracket: color === "cyan" ? "border-cyan-300/45" : "border-violet-300/45",
	};

	// 把控制方式拆成可独立高亮的键
	const controlGroups = controls.split("·").map((s) => s.trim());

	return (
		// 视口锁定 + 整页禁止滚动
		<main className="game-shell relative flex h-svh flex-col overflow-hidden bg-[#05070b] text-white">
			{/* 背景光晕：右半区更亮，烘托游戏舞台 */}
			<div
				className={`pointer-events-none absolute inset-y-0 right-0 left-0 lg:left-[300px] xl:left-[360px] ${tone.glow} blur-3xl`}
				aria-hidden
			/>

			{/* 顶栏：返回 + 品牌。固定高度。 */}
			<header className="z-20 flex shrink-0 items-center justify-between border-b border-white/5 bg-[#05070b]/80 px-4 py-2.5 backdrop-blur-md sm:px-6 sm:py-3">
				<Link
					to="/"
					className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-white/65 transition hover:border-white/25 hover:text-white sm:px-4"
				>
					<ArrowLeft size={15} /> 返回控制台
				</Link>
				<span className="inline-flex items-center gap-2 font-semibold text-white/45 text-xs uppercase tracking-[0.24em]">
					<Gamepad2 size={15} /> Nexus Play Lab
				</span>
			</header>

			{/* 主体：移动端上下堆叠，lg+ 左右分栏 */}
			<div className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
				{/* ─────────────────────────────────────────────── */}
				{/* 移动端紧凑头部：仅标题 + 控制提示，节省纵向空间 */}
				{/* ─────────────────────────────────────────────── */}
				<div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/5 px-4 py-2.5 sm:px-6 lg:hidden">
					<div className="min-w-0 flex-1">
						<div
							className={`inline-flex items-center gap-1.5 font-semibold text-[9px] uppercase tracking-[0.28em] ${tone.text}`}
						>
							<span className={`size-1 rounded-full ${tone.dot}`} />
							{eyebrow}
						</div>
						<h1 className="mt-0.5 truncate font-black text-lg tracking-tight">
							{title}
						</h1>
					</div>
					{controlGroups.length > 0 && (
						<div className="hidden shrink-0 rounded-md border border-white/8 bg-white/[0.025] px-2.5 py-1.5 sm:block">
							<p className="font-mono text-[10px] text-white/65 tracking-wide">
								{controlGroups[0]}
							</p>
						</div>
					)}
				</div>

				{/* ─────────────────────────────────────────────── */}
				{/* 桌面端左侧栏：完整游戏介绍 */}
				{/* ─────────────────────────────────────────────── */}
				<aside className="hidden shrink-0 flex-col gap-5 overflow-y-auto border-r border-white/5 px-7 py-7 lg:flex lg:w-[300px] xl:w-[360px] xl:gap-6 xl:px-8 xl:py-8">
					{/* 分类徽章 */}
					<div
						className={`inline-flex w-fit items-center gap-2 rounded-md border px-2.5 py-1 font-semibold text-[10px] uppercase tracking-[0.28em] ${tone.chip} ${tone.text}`}
					>
						<span
							className={`size-1.5 rounded-full ${tone.dot} shadow-[0_0_10px_currentColor]`}
						/>
						{eyebrow}
					</div>

					{/* 标题 */}
					<h1 className="-mt-1 font-black text-3xl tracking-[-0.045em] leading-[1.05] xl:text-[2.25rem]">
						{title}
					</h1>

					{/* 描述 */}
					<p className="text-sm text-white/55 leading-relaxed">{description}</p>

					{/* 分隔线 */}
					<div className="h-px bg-gradient-to-r from-white/10 via-white/5 to-transparent" />

					{/* 控制方式：每组独立卡片 */}
					<div className="flex flex-col gap-2.5">
						<p className="text-[10px] text-white/40 uppercase tracking-[0.28em]">
							控制方式
						</p>
						<div className="flex flex-col gap-1.5">
							{controlGroups.map((group) => (
								<div
									key={group}
									className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2"
								>
									<span className={`size-1.5 rounded-full ${tone.dot}`} />
									<span className="font-mono text-[12px] text-white/85 tracking-wide">
										{group}
									</span>
								</div>
							))}
						</div>
					</div>

					{/* 底部状态徽章 */}
					<div className="mt-auto flex items-center gap-2 pt-3">
						<span className="relative flex size-2">
							<span
								className={`absolute inline-flex h-full w-full animate-ping rounded-full ${tone.dot} opacity-60`}
							/>
							<span
								className={`relative inline-flex size-2 rounded-full ${tone.dot}`}
							/>
						</span>
						<span className="text-[10px] text-white/40 uppercase tracking-[0.28em]">
							系统就绪 · 等待指令
						</span>
					</div>
				</aside>

				{/* ─────────────────────────────────────────────── */}
				{/* 右侧游戏舞台 */}
				{/* ─────────────────────────────────────────────── */}
				<section className="relative flex min-h-0 min-h-[60vh] flex-1 items-center justify-center p-3 sm:p-5 lg:min-h-0">
					{/* 四角装饰括号（仅 sm+ 显示） */}
					<span
						className={`pointer-events-none absolute top-4 left-4 z-10 hidden size-5 border-t-2 border-l-2 sm:block sm:size-6 ${tone.bracket}`}
						aria-hidden
					/>
					<span
						className={`pointer-events-none absolute top-4 right-4 z-10 hidden size-5 border-t-2 border-r-2 sm:block sm:size-6 ${tone.bracket}`}
						aria-hidden
					/>
					<span
						className={`pointer-events-none absolute bottom-4 left-4 z-10 hidden size-5 border-b-2 border-l-2 sm:block sm:size-6 ${tone.bracket}`}
						aria-hidden
					/>
					<span
						className={`pointer-events-none absolute bottom-4 right-4 z-10 hidden size-5 border-b-2 border-r-2 sm:block sm:size-6 ${tone.bracket}`}
						aria-hidden
					/>

					{/* 顶部状态条（仅 lg+ 显示） */}
					<div className="pointer-events-none absolute top-4 left-1/2 z-10 hidden -translate-x-1/2 lg:block">
						<span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-3 py-1 font-mono text-[10px] text-white/55 uppercase tracking-[0.24em] backdrop-blur-md">
							<span className={`size-1 rounded-full ${tone.dot}`} />
							LIVE PREVIEW
						</span>
					</div>

					{/* 游戏舞台本体 */}
					<div className="game-stage h-full w-full">{children}</div>
				</section>
			</div>
		</main>
	);
}
