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
	return (
		<main className="game-shell min-h-svh bg-[#05070b] px-4 py-5 text-white sm:px-7">
			<div className="mx-auto max-w-7xl">
				<header className="mb-5 flex items-center justify-between">
					<Link
						to="/"
						className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/65 transition hover:border-white/25 hover:text-white"
					>
						<ArrowLeft size={15} /> 返回控制台
					</Link>
					<span className="inline-flex items-center gap-2 font-semibold text-white/45 text-xs uppercase tracking-[0.24em]">
						<Gamepad2 size={15} /> Nexus Play Lab
					</span>
				</header>
				<section className="mb-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
					<div>
						<p
							className={color === "cyan" ? "text-cyan-300" : "text-violet-300"}
						>
							{eyebrow}
						</p>
						<h1 className="mt-2 font-black text-3xl tracking-[-0.04em] sm:text-5xl">
							{title}
						</h1>
						<p className="mt-3 max-w-2xl text-sm text-white/55">
							{description}
						</p>
					</div>
					<div className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-right">
						<p className="text-[10px] text-white/35 uppercase tracking-[0.2em]">
							控制方式
						</p>
						<p className="mt-1 font-medium text-sm text-white/75">{controls}</p>
					</div>
				</section>
				{children}
			</div>
		</main>
	);
}
