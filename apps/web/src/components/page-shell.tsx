import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export interface PageShellProps {
	title: string;
	subtitle?: string;
	maxWidth?: "3xl" | "4xl" | "5xl";
	children: ReactNode;
}

const MAX_WIDTH: Record<NonNullable<PageShellProps["maxWidth"]>, string> = {
	"3xl": "max-w-3xl",
	"4xl": "max-w-4xl",
	"5xl": "max-w-5xl",
};

/**
 * 统一的暗色渐变页面外壳：背景光晕 + 返回首页 + 标题区。
 */
export default function PageShell({
	title,
	subtitle,
	maxWidth = "4xl",
	children,
}: PageShellProps) {
	return (
		<div className="relative min-h-svh overflow-hidden bg-[#0a0a0f] text-white">
			{/* 背景光晕 */}
			<div className="pointer-events-none absolute inset-0">
				<div className="absolute top-[-10%] left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-600/25 via-fuchsia-600/15 to-cyan-500/25 blur-[120px]" />
			</div>

			<div className={`relative mx-auto px-4 py-6 ${MAX_WIDTH[maxWidth]}`}>
				<Link
					to="/"
					className="mb-4 inline-flex items-center gap-1 text-sm text-white/50 transition-colors hover:text-white"
				>
					← 返回首页
				</Link>
				<header className="mb-7">
					<h1 className="font-bold text-2xl tracking-tight md:text-3xl">
						{title}
					</h1>
					{subtitle && (
						<p className="mt-1.5 text-sm text-white/50">{subtitle}</p>
					)}
				</header>
				{children}
			</div>
		</div>
	);
}
