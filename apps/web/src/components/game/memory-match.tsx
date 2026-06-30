import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { cn } from "@x-game/ui/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { THEME_KEYS, type Theme, useGameState } from "@/hooks/use-game-state";
import { useGameSubmit } from "@/hooks/use-game-submit";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

import ResultModal from "./result-modal";
import StatBar from "./stat-bar";
import ThemeChips from "./theme-chips";

import "./memory-match.css";

const PARTICLE_COLORS = ["#ff6b6b", "#ffd166", "#4ecdc4", "#c780fa"];

function fmtTime(s: number): string {
	const m = Math.floor(s / 60);
	const ss = s % 60;
	return `${m}:${ss.toString().padStart(2, "0")}`;
}

function playTone(
	ctx: AudioContext | null,
	freq: number,
	dur: number,
	type: OscillatorType = "sine",
	gain = 0.08,
	attack = 0.005,
	release = 0.08,
) {
	if (!ctx) return;
	if (ctx.state === "suspended") ctx.resume();
	const t0 = ctx.currentTime;
	const osc = ctx.createOscillator();
	const g = ctx.createGain();
	osc.type = type;
	osc.frequency.value = freq;
	g.gain.setValueAtTime(0, t0);
	g.gain.linearRampToValueAtTime(gain, t0 + attack);
	g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + release);
	osc.connect(g).connect(ctx.destination);
	osc.start(t0);
	osc.stop(t0 + dur + release + 0.02);
}

function useAudioCtx(): AudioContext | null {
	const ref = useRef<AudioContext | null>(null);
	const get = useCallback((): AudioContext | null => {
		if (typeof window === "undefined") return null;
		if (!ref.current) {
			try {
				const Ctor =
					window.AudioContext ||
					(window as unknown as { webkitAudioContext: typeof AudioContext })
						.webkitAudioContext;
				if (!Ctor) return null;
				ref.current = new Ctor();
			} catch {
				ref.current = null;
			}
		}
		return ref.current;
	}, []);

	useEffect(() => {
		return () => {
			if (ref.current) {
				ref.current.close().catch(() => {});
				ref.current = null;
			}
		};
	}, []);

	return get();
}

function useSfx(sound: boolean) {
	const ctx = useAudioCtx();
	return useMemo(() => {
		const safeTone = (
			freq: number,
			dur: number,
			type: OscillatorType,
			gain: number,
		) => {
			if (!sound) return;
			playTone(ctx, freq, dur, type, gain);
		};
		return {
			flip: () => safeTone(620, 0.04, "triangle", 0.06),
			match: () => {
				safeTone(660, 0.09, "sine", 0.1);
				setTimeout(() => safeTone(880, 0.12, "sine", 0.1), 70);
			},
			miss: () => {
				safeTone(220, 0.08, "square", 0.05);
				setTimeout(() => safeTone(165, 0.12, "square", 0.05), 80);
			},
			win: () => {
				const notes = [523, 659, 784, 1046];
				notes.forEach((f, i) => {
					setTimeout(() => safeTone(f, 0.18, "triangle", 0.09), i * 110);
				});
			},
			pop: () => safeTone(990, 0.05, "sine", 0.05),
		};
	}, [ctx, sound]);
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
		p.className = "p-particle";
		p.style.left = `${x - 4}px`;
		p.style.top = `${y - 4}px`;
		const color = colors[i % colors.length];
		p.style.background = color;
		p.style.boxShadow = `0 0 8px ${color}`;
		const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
		const dist = 60 + Math.random() * 70;
		const dx = Math.cos(angle) * dist;
		const dy = Math.sin(angle) * dist - 20;
		const rot = (Math.random() * 360) | 0;
		p.style.transition =
			"transform .7s cubic-bezier(.2,.7,.2,1), opacity .7s ease";
		host.appendChild(p);
		requestAnimationFrame(() => {
			p.style.transform = `translate(${dx}px, ${dy + 80}px) rotate(${rot}deg) scale(.4)`;
			p.style.opacity = "0";
		});
		setTimeout(() => p.remove(), 750);
	}
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

	const sfx = useSfx(state.sound);
	const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
	const particlesRef = useRef<HTMLDivElement | null>(null);
	const finishRef = useRef<() => void>(() => {});
	const [modalOpen, setModalOpen] = useState(false);
	const [stars, setStars] = useState<1 | 2 | 3>(1);
	const submit = useGameSubmit();

	const { data: session } = authClient.useSession();
	const isLoggedIn = Boolean(session);

	const myBest = useQuery(
		trpc.game.myBest.queryOptions(
			{ theme: state.theme },
			{ enabled: isLoggedIn },
		),
	);

	const leaderboard = useQuery(
		trpc.leaderboard.list.queryOptions(
			{ theme: state.theme, limit: 10 },
			{ enabled: isLoggedIn && modalOpen },
		),
	);

	// Reset card refs when the deck changes.
	useEffect(() => {
		cardRefs.current = cardRefs.current.slice(0, state.cards.length);
	}, [state.cards.length]);

	// Hide modal when a new game starts.
	useEffect(() => {
		if (!state.finished) setModalOpen(false);
	}, [state.finished]);

	const handleFlip = useCallback(
		(idx: number) => {
			if (state.busy || state.finished) return;
			const card = state.cards[idx];
			if (!card || card.matched) return;
			if (state.flipped.includes(idx)) return;
			if (state.flipped.length >= 2) return;

			const el = cardRefs.current[idx];
			if (el) el.classList.add("flipped");
			sfx.flip();

			if (state.flipped.length === 0) {
				flipFirst(idx);
				return;
			}

			const a = state.flipped[0];
			const b = idx;
			const aCard = state.cards[a];
			const bCard = state.cards[b];
			if (!aCard || !bCard) return;

			if (aCard.icon === bCard.icon) {
				flipMatch(a, b);
				window.setTimeout(() => {
					const elA = cardRefs.current[a];
					const elB = cardRefs.current[b];
					if (elA) elA.classList.add("matched", "pop");
					if (elB) elB.classList.add("matched", "pop");
					sfx.match();
					if (elA) {
						const r1 = elA.getBoundingClientRect();
						burstAt(
							particlesRef.current,
							r1.left + r1.width / 2,
							r1.top + r1.height / 2,
							12,
						);
					}
					if (elB) {
						const r2 = elB.getBoundingClientRect();
						burstAt(
							particlesRef.current,
							r2.left + r2.width / 2,
							r2.top + r2.height / 2,
							12,
						);
					}
					const nextMatched = state.matched + 1;
					if (nextMatched === 8) {
						finishRef.current();
					}
				}, 280);
			} else {
				flipMiss(a, b);
				window.setTimeout(() => {
					const elA = cardRefs.current[a];
					const elB = cardRefs.current[b];
					if (elA) elA.classList.add("shake");
					if (elB) elB.classList.add("shake");
					sfx.miss();
					window.setTimeout(() => {
						if (elA) elA.classList.remove("flipped", "shake", "matched", "pop");
						if (elB) elB.classList.remove("flipped", "shake", "matched", "pop");
						resolveMiss();
					}, 450);
				}, 550);
			}
		},
		[
			state.busy,
			state.finished,
			state.cards,
			state.flipped,
			state.matched,
			sfx,
			flipFirst,
			flipMatch,
			flipMiss,
			resolveMiss,
		],
	);

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
			sfx.win();
		}, 600);

		if (session) {
			submit
				.submit({ ...payload.record, clientNonce: payload.clientNonce })
				.then((result: { isNewBest: boolean } | null) => {
					if (result) {
						if (result.isNewBest) {
							toast.success("成绩已保存 · 新纪录！");
						} else {
							toast.success("成绩已保存");
						}
					}
				});
		} else {
			toast("匿名试玩不入库 · 登录后可保存成绩", { icon: "ℹ️" });
		}
	}, [finish, sfx, submit, session, state.moves]);

	useEffect(() => {
		finishRef.current = handleFinish;
	}, [handleFinish]);

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
				sfx.pop();
			} else if (e.key === "m" || e.key === "M") {
				setSound(!state.sound);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [newGame, setSound, sfx, state.sound]);

	const soundIconOpacity = state.sound ? 1 : 0.4;

	const bestLabel = useMemo(() => {
		if (isLoggedIn) {
			const data = myBest.data;
			const cloudBest = data && !Array.isArray(data) ? data.best : null;
			if (cloudBest) {
				return `${cloudBest.moves} 步 / ${fmtTime(cloudBest.seconds)}`;
			}
			if (myBest.isLoading) {
				return state.best
					? `${state.best.moves} 步 / ${fmtTime(state.best.seconds)}`
					: "—";
			}
		}
		if (state.best) {
			return `${state.best.moves} 步 / ${fmtTime(state.best.seconds)}`;
		}
		return "—";
	}, [isLoggedIn, myBest.data, myBest.isLoading, state.best]);

	const bestResult = getBestResult();
	const bestBadge = useMemo(() => {
		if (!state.finished) return null;
		if (bestResult.improved) {
			const prev = bestResult.prev;
			return (
				<span className="best-badge">
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
				<span
					className="best-badge"
					style={{
						color: "var(--ink-2)",
						background: "rgba(255,255,255,.04)",
						borderColor: "rgba(255,255,255,.08)",
					}}
				>
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
		if (me) {
			return `你的最佳：第 ${me.rank} 名`;
		}
		return null;
	}, [isLoggedIn, leaderboard.data, session]);

	const handlePlayAgain = useCallback(() => {
		newGame();
		sfx.pop();
	}, [newGame, sfx]);

	const handleThemeSelect = useCallback(
		(t: string) => {
			if ((THEME_KEYS as readonly string[]).includes(t)) {
				setTheme(t as Theme);
				sfx.pop();
			}
		},
		[setTheme, sfx],
	);

	const handleNewGame = useCallback(() => {
		newGame();
		sfx.pop();
	}, [newGame, sfx]);

	const handleSoundToggle = useCallback(() => {
		setSound(!state.sound);
	}, [setSound, state.sound]);

	return (
		<div className="mm">
			<div className="mm-topbar">
				<Link to="/" className="mm-back">
					← 返回首页
				</Link>
			</div>

			<header>
				<div className="brand">
					<span className="dot" />
					<h1>记忆翻牌</h1>
					<span className="sub">MEMORY MATCH</span>
				</div>
			</header>

			<StatBar
				time={state.seconds}
				moves={state.moves}
				bestLabel={bestLabel === "—" ? null : bestLabel}
			/>

			<ThemeChips
				themes={THEME_KEYS as unknown as readonly string[]}
				active={state.theme}
				onSelect={handleThemeSelect}
			/>

			<div className="board-wrap">
				{/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-label on container div mirrors the original HTML markup */}
				<div className="board" aria-label="游戏面板">
					{state.cards.map((c) => {
						const isFlipped = state.flipped.includes(c.idx) || c.matched;
						return (
							// biome-ignore lint/a11y/useSemanticElements: preserving original HTML's div.card with role="button" for visual parity
							// biome-ignore lint/a11y/useFocusableInteractive: original HTML card was not keyboard-focusable
							// biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: see above
							// biome-ignore lint/a11y/useKeyWithClickEvents: card is mouse-only in the original HTML
							<div
								key={c.idx}
								ref={(el) => {
									cardRefs.current[c.idx] = el;
								}}
								className={cn(
									"card",
									isFlipped && "flipped",
									c.matched && "matched pop",
								)}
								data-idx={c.idx}
								role="button"
								aria-label={isFlipped ? "已翻开的牌" : "未翻开的牌"}
								onClick={() => handleFlip(c.idx)}
							>
								<div className="face face-back">
									<span className="emblem" />
								</div>
								<div className="face face-front">
									<span className="icon">{c.icon}</span>
								</div>
							</div>
						);
					})}
				</div>
			</div>

			<div className="controls">
				<button className="btn" type="button" onClick={handleNewGame}>
					<svg
						aria-hidden="true"
						className="icon-btn"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.4"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M3 12a9 9 0 1 0 3-6.7" />
						<path d="M3 4v5h5" />
					</svg>
					新游戏
				</button>
				<button
					className="btn ghost"
					type="button"
					aria-pressed={state.sound}
					onClick={handleSoundToggle}
				>
					<svg
						aria-hidden="true"
						className="icon-btn"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.4"
						strokeLinecap="round"
						strokeLinejoin="round"
						style={{ opacity: soundIconOpacity }}
					>
						<path d="M11 5L6 9H2v6h4l5 4z" />
						<path d="M15.5 8.5a5 5 0 0 1 0 7" />
						<path d="M18.5 5.5a9 9 0 0 1 0 13" />
					</svg>
					<span>{state.sound ? "音效 开" : "音效 关"}</span>
				</button>
			</div>

			<p className="hint">翻开两张相同的牌即可配对 · 越少步数越快越好</p>

			<ResultModal
				open={modalOpen}
				time={state.seconds}
				moves={state.moves}
				stars={stars}
				bestBadge={bestBadge}
				onPlayAgain={handlePlayAgain}
				footer={
					isLoggedIn ? (
						<div style={{ marginTop: 10, fontSize: 12 }}>
							<Link
								to="/leaderboard"
								style={{ color: "var(--ink-2)", textDecoration: "underline" }}
							>
								查看排行榜
							</Link>
							{leaderboardHint && (
								<span style={{ marginLeft: 10, color: "var(--amber)" }}>
									{leaderboardHint}
								</span>
							)}
						</div>
					) : null
				}
			/>

			<div
				className="particles"
				aria-hidden="true"
				ref={(el) => {
					particlesRef.current = el;
				}}
			/>
		</div>
	);
}
