import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Gamepad2, Volume2, VolumeX, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import ResultModal from "@/components/game/result-modal";
import StatBar from "@/components/game/stat-bar";
import ThemeChips from "@/components/game/theme-chips";
import { THEME_KEYS, type Theme, useGameState } from "@/hooks/use-game-state";
import { useGameSubmit } from "@/hooks/use-game-submit";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

import "./memory-match.css";

const PARTICLE_COLORS = ["#22d3ee", "#a78bfa", "#facc15", "#fb7185"];

function fmtTime(s: number): string {
	const m = Math.floor(s / 60);
	const ss = s % 60;
	return `${m}:${ss.toString().padStart(2, "0")}`;
}

export default function MemoryMatchGame() {
	const {
		state,
		flipFirst,
		flipMatch,
		flipMiss,
		resolveMiss,
		newGame,
		setTheme,
		setSound,
		finish,
		getBestResult,
	} = useGameState();

	const submit = useGameSubmit();
	const particlesRef = useRef<HTMLDivElement | null>(null);
	const [modalOpen, setModalOpen] = useState(false);
	const [stars, setStars] = useState<1 | 2 | 3>(1);
	const [shakeIdx, setShakeIdx] = useState<number | null>(null);

	const { data: session } = authClient.useSession();
	const isLoggedIn = Boolean(session);

	const myBest = useQuery(
		trpc.game.myBest.queryOptions(
			{ gameId: "memory-match", theme: state.theme },
			{ enabled: isLoggedIn },
		),
	);

	const leaderboard = useQuery(
		trpc.leaderboard.list.queryOptions(
			{ gameId: "memory-match", theme: state.theme, limit: 10 },
			{ enabled: isLoggedIn && modalOpen },
		),
	);

	// Hide modal whenever a new round starts.
	useEffect(() => {
		if (!state.finished) setModalOpen(false);
	}, [state.finished]);

	// Keyboard shortcuts.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			if (
				target &&
				(target.tagName === "INPUT" || target.tagName === "TEXTAREA")
			) {
				return;
			}
			if (e.key === "n" || e.key === "N") {
				newGame();
				setShakeIdx(null);
			} else if (e.key === "m" || e.key === "M") {
				setSound(!state.sound);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [newGame, setSound, state.sound]);

	const handleFlip = useCallback(
		(idx: number) => {
			if (state.busy || state.finished) return;
			const card = state.cards[idx];
			if (!card || card.matched) return;
			if (state.flipped.includes(idx)) return;
			if (state.flipped.length >= 2) return;

			if (state.flipped.length === 0) {
				flipFirst(idx);
				return;
			}

			const a = state.flipped[0];
			const b = idx;
			const aCard = state.cards[a];
			const bCard = state.cards[b];
			if (!aCard || !bCard) return;

			const flipTargets: Array<HTMLDivElement | null> = [
				document.querySelector<HTMLDivElement>(`[data-card-idx="${a}"]`),
				document.querySelector<HTMLDivElement>(`[data-card-idx="${b}"]`),
			];

			if (aCard.icon === bCard.icon) {
				flipMatch(a, b);
				const matchedCenter = flipTargets
					.map((el) => el?.getBoundingClientRect())
					.filter((r): r is DOMRect => Boolean(r));
				window.setTimeout(() => {
					for (const rect of matchedCenter) {
						burstAt(
							particlesRef.current,
							rect.left + rect.width / 2,
							rect.top + rect.height / 2,
							12,
						);
					}
					if (state.matched + 1 === 8) {
						finishRef.current();
					}
				}, 280);
			} else {
				flipMiss(a, b);
				setShakeIdx(b);
				window.setTimeout(() => {
					resolveMiss();
					setShakeIdx(null);
				}, 550);
			}
		},
		[
			state.busy,
			state.finished,
			state.cards,
			state.flipped,
			state.matched,
			flipFirst,
			flipMatch,
			flipMiss,
			resolveMiss,
		],
	);

	const finishRef = useRef<() => void>(() => {});
	const handleFinish = useCallback(() => {
		const moves = state.moves;
		const computedStars: 1 | 2 | 3 = moves <= 12 ? 3 : moves <= 18 ? 2 : 1;
		setStars(computedStars);
		const payload = finish(computedStars);
		setModalOpen(true);
		window.setTimeout(() => {
			burstAt(
				particlesRef.current,
				window.innerWidth / 2,
				window.innerHeight / 2,
				30,
			);
		}, 600);

		if (session) {
			submit.submit(payload).then((result) => {
				if (result?.isNewBest) {
					toast.success("成绩已保存 · 新纪录！");
				} else if (result) {
					toast.success("成绩已保存");
				}
			});
		} else {
			toast("匿名试玩不入库 · 登录后可保存成绩", { icon: "ℹ️" });
		}
	}, [finish, submit, session, state.moves]);

	useEffect(() => {
		finishRef.current = handleFinish;
	}, [handleFinish]);

	const bestLabel = useMemo(() => {
		if (isLoggedIn) {
			const data = myBest.data;
			const cloudBest = data && !Array.isArray(data) ? data.best : null;
			if (cloudBest) {
				const seconds = cloudBest.durationSeconds ?? cloudBest.seconds ?? 0;
				return `${cloudBest.moves ?? "?"} 步 / ${fmtTime(seconds)}`;
			}
			if (myBest.isLoading) {
				return state.best
					? `${state.best.moves} 步 / ${fmtTime(state.best.seconds)}`
					: null;
			}
		}
		if (state.best) {
			return `${state.best.moves} 步 / ${fmtTime(state.best.seconds)}`;
		}
		return null;
	}, [isLoggedIn, myBest.data, myBest.isLoading, state.best]);

	const bestResult = getBestResult();
	const bestBadge = useMemo(() => {
		if (!state.finished) return null;
		if (bestResult.improved) {
			const prev = bestResult.prev;
			return (
				<span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 font-semibold text-[11px] text-amber-300 tracking-wide">
					★ 新纪录！
					{prev
						? `旧记录 ${prev.moves} 步 / ${fmtTime(prev.seconds)}`
						: "第一次记录"}
				</span>
			);
		}
		const prev = bestResult.prev;
		if (prev) {
			return (
				<span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-semibold text-[11px] text-white/65 tracking-wide">
					最佳 {prev.moves} 步 / {fmtTime(prev.seconds)}
				</span>
			);
		}
		return null;
	}, [state.finished, bestResult.improved, bestResult.prev]);

	const leaderboardHint = useMemo(() => {
		if (!isLoggedIn || !leaderboard.data) return null;
		const meId = session?.user.id;
		if (!meId) return null;
		type LbItem = { rank: number; user: { id: string } };
		const items = leaderboard.data.items as LbItem[];
		const me = leaderboard.data.me as { rank: number } | null;
		const inTop = items.some((row) => row.user.id === meId);
		if (inTop) {
			const myRow = items.find((row) => row.user.id === meId);
			if (myRow) return `你的排名：第 ${myRow.rank} 名`;
			return null;
		}
		if (me) return `你的最佳：第 ${me.rank} 名`;
		return null;
	}, [isLoggedIn, leaderboard.data, session]);

	const handlePlayAgain = useCallback(() => {
		newGame();
		setModalOpen(false);
		setShakeIdx(null);
	}, [newGame]);

	const handleThemeSelect = useCallback(
		(t: string) => {
			if ((THEME_KEYS as readonly string[]).includes(t)) {
				setTheme(t as Theme);
			}
		},
		[setTheme],
	);

	return (
		<div className="nexus-bg relative flex min-h-svh flex-col items-center overflow-x-hidden bg-[#05070a] px-4 py-5 text-[#eef1f7] sm:px-6 sm:py-8">
			<header className="z-10 flex w-full max-w-3xl items-center justify-between">
				<Link
					to="/"
					className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-white/65 transition hover:border-white/25 hover:text-white sm:px-4"
				>
					<ArrowLeft size={15} /> 返回控制台
				</Link>
				<span className="inline-flex items-center gap-2 font-semibold text-[10px] text-white/45 uppercase tracking-[0.28em] sm:text-xs">
					<Gamepad2 size={15} /> NEXUS · Memory Match
				</span>
			</header>

			<main className="z-10 flex w-full max-w-3xl flex-1 flex-col items-stretch gap-5 pt-6">
				<div>
					<p className="flex items-center gap-2 text-[#d9ff43] text-[10px] uppercase tracking-[0.25em]">
						<span className="h-1.5 w-1.5 rounded-full bg-[#d9ff43] shadow-[0_0_10px_#d9ff43]" />
						Puzzle · Live
					</p>
					<h1 className="mt-2 font-black text-3xl tracking-[-0.04em] md:text-4xl">
						记忆矩阵
					</h1>
					<p className="mt-1.5 max-w-xl text-sm text-white/42 leading-6">
						翻开两张相同的牌即可配对 · 越少步数越快越好
					</p>
				</div>

				<StatBar
					time={state.seconds}
					moves={state.moves}
					bestLabel={bestLabel}
				/>

				<ThemeChips
					themes={THEME_KEYS as unknown as readonly string[]}
					active={state.theme}
					onSelect={handleThemeSelect}
				/>

				<div className="relative mx-auto aspect-square w-full">
					<span
						aria-hidden
						className="pointer-events-none absolute inset-3 rounded-3xl border border-white/[0.07]"
					/>
					<section
						className="relative grid h-full w-full grid-cols-4 grid-rows-4 gap-[clamp(6px,1.5vw,12px)] p-3"
						aria-label="游戏面板"
					>
						{state.cards.map((c) => {
							const isFlipped = state.flipped.includes(c.idx) || c.matched;
							const isMatched = c.matched;
							const isShaking = shakeIdx === c.idx;
							return (
								<button
									key={c.idx}
									type="button"
									data-card-idx={c.idx}
									disabled={isMatched || state.busy}
									aria-label={isFlipped ? "已翻开的牌" : "未翻开的牌"}
									onClick={() => handleFlip(c.idx)}
									className={`mm-card group relative cursor-pointer rounded-2xl [transform-style:preserve-3d] [transition:transform_0.5s_cubic-bezier(0.4,0,0.2,1)] disabled:cursor-default ${
										isFlipped ? "mm-flipped" : ""
									} ${isMatched ? "mm-matched" : ""} ${
										isShaking ? "mm-shaking" : ""
									}`}
								>
									<span
										aria-hidden
										className="absolute inset-0 rounded-2xl [-webkit-backface-visibility:hidden] [backface-visibility:hidden]"
									>
										<span className="absolute inset-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#10172a] via-[#0b1120] to-[#14213a] shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
											<span className="pointer-events-none absolute inset-0 opacity-80 [animation:mm-spin_6s_linear_infinite] [background:conic-gradient(from_0deg,rgba(34,211,238,0)_0deg,rgba(34,211,238,0.45)_60deg,rgba(168,139,250,0.45)_140deg,rgba(250,204,21,0.45)_220deg,rgba(251,113,133,0.45)_300deg,rgba(34,211,238,0)_360deg)]" />
											<span className="absolute inset-[6px] rounded-xl bg-gradient-to-br from-[#0e1729] to-[#070d1b]" />
											<span className="absolute top-1/2 left-1/2 z-10 h-[38%] w-[38%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-cyan-300 via-violet-300 to-amber-300 shadow-[0_0_18px_rgba(250,204,21,0.55)]">
												<span className="absolute top-1/2 left-1/2 h-[28%] w-[28%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#05070a]" />
											</span>
										</span>
									</span>

									<span
										aria-hidden
										className="absolute inset-0 grid place-items-center rounded-2xl bg-[#fef9ef] text-[#1a2538] shadow-[0_8px_24px_rgba(0,0,0,0.35)] [-webkit-backface-visibility:hidden] [backface-visibility:hidden] [transform:rotateY(180deg)]"
										style={{ fontSize: "clamp(28px, 7.5vw, 48px)" }}
									>
										<span>{c.icon}</span>
									</span>
								</button>
							);
						})}
					</section>
				</div>

				<div className="flex flex-wrap items-center justify-center gap-3">
					<button
						type="button"
						onClick={newGame}
						className="inline-flex items-center gap-2 rounded-full bg-[#d9ff43] px-5 py-2 font-bold text-black text-sm shadow-[0_0_24px_rgba(217,255,67,0.35)] transition hover:bg-[#c4f02e]"
					>
						<Zap size={15} /> 新游戏
					</button>
					<button
						type="button"
						aria-pressed={state.sound}
						onClick={() => setSound(!state.sound)}
						className="inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.025] px-4 py-2 font-medium text-sm text-white/65 transition hover:border-white/20 hover:text-white"
					>
						{state.sound ? <Volume2 size={15} /> : <VolumeX size={15} />}
						<span>音效 {state.sound ? "开" : "关"}</span>
					</button>
				</div>

				<p className="text-center text-[10px] text-white/30 uppercase tracking-[0.18em]">
					按 N 重开 · 按 M 切换音效
				</p>
			</main>

			<ResultModal
				open={modalOpen}
				time={state.seconds}
				moves={state.moves}
				stars={stars}
				bestBadge={bestBadge}
				onPlayAgain={handlePlayAgain}
				footer={
					isLoggedIn ? (
						<div className="text-center text-white/55 text-xs">
							<Link
								to="/leaderboard"
								className="font-medium text-cyan-300 underline-offset-4 transition hover:text-cyan-200 hover:underline"
							>
								查看排行榜
							</Link>
							{leaderboardHint && (
								<span className="ml-2 text-white/45">{leaderboardHint}</span>
							)}
						</div>
					) : null
				}
			/>

			<div
				ref={particlesRef}
				aria-hidden
				className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
			/>
		</div>
	);
}

function burstAt(
	host: HTMLElement | null,
	x: number,
	y: number,
	count = 14,
	colors: string[] = PARTICLE_COLORS,
) {
	if (!host) return;
	for (let i = 0; i < count; i++) {
		const p = document.createElement("div");
		p.className = "mm-particle";
		p.style.left = `${x - 4}px`;
		p.style.top = `${y - 4}px`;
		const color = colors[i % colors.length];
		p.style.background = color;
		p.style.boxShadow = `0 0 8px ${color}`;
		const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
		const dist = 60 + Math.random() * 70;
		p.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
		p.style.setProperty("--dy", `${Math.sin(angle) * dist - 20}px`);
		p.style.setProperty("--rot", `${(Math.random() * 360) | 0}deg`);
		host.appendChild(p);
		window.setTimeout(() => p.remove(), 750);
	}
}
