import { useCallback, useEffect, useReducer, useRef } from "react";

export const THEMES = {
	animals: ["🦊", "🐙", "🦄", "🐉", "🐳", "🦋", "🐢", "🐝"],
	space: ["🌟", "🚀", "🪐", "👽", "🌙", "☄️", "🌌", "🛸"],
	food: ["🍕", "🍣", "🍩", "🍦", "🍉", "🌮", "🍰", "🍪", "🍪"],
	music: ["🎸", "🎹", "🎺", "🎻", "🥁", "🎷", "🎤", "🪗"],
	ocean: ["🐠", "🐡", "🐬", "🦈", "🐚", "🦀", "🐟", "🦑"],
	gems: ["💎", "💍", "💰", "🏆", "🎁", "✨", "🪙", "🧿"],
	faces: ["😎", "🤩", "🥳", "😻", "🤖", "👻", "🎃", "🐱"],
} as const;

export const THEME_KEYS = Object.keys(THEMES) as Theme[];

export type Theme = keyof typeof THEMES;

export interface CardData {
	idx: number;
	icon: string;
	matched: boolean;
}

export interface BestRecord {
	moves: number;
	seconds: number;
}

export interface GameState {
	theme: Theme;
	sound: boolean;
	cards: CardData[];
	moves: number;
	matched: number;
	seconds: number;
	started: boolean;
	finished: boolean;
	busy: boolean;
	flipped: number[]; // card indices currently flipped
	best: BestRecord | null;
}

export type BestResult = { improved: boolean; prev: BestRecord | null };

type Action =
	| { type: "FLIP_FIRST"; idx: number }
	| { type: "FLIP_SECOND_MATCH"; a: number; b: number }
	| { type: "FLIP_SECOND_MISS"; a: number; b: number }
	| { type: "MISS_RESOLVED" }
	| { type: "RESET" }
	| { type: "SET_THEME"; theme: Theme }
	| { type: "SET_SOUND"; sound: boolean }
	| { type: "TICK" }
	| { type: "FINISH" };

const STORAGE_THEME = "mm.theme";
const STORAGE_SOUND = "mm.sound";

function isTheme(value: string): value is Theme {
	return Object.hasOwn(THEMES, value);
}

function readInitialTheme(): Theme {
	if (typeof window === "undefined") return "animals";
	const raw = window.localStorage.getItem(STORAGE_THEME);
	return raw && isTheme(raw) ? raw : "animals";
}

function readInitialSound(): boolean {
	if (typeof window === "undefined") return true;
	return window.localStorage.getItem(STORAGE_SOUND) !== "0";
}

function shuffle<T>(arr: T[]): T[] {
	const a = arr.slice();
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

function buildCards(theme: Theme): CardData[] {
	const source: string[] = [...(THEMES[theme] as readonly string[])];
	const icons = shuffle(source).slice(0, 8);
	const deck = shuffle([...icons, ...icons]);
	return deck.map((icon, i) => ({ idx: i, icon, matched: false }));
}

function bestKey(theme: Theme): string {
	return `mm.best.${theme}`;
}

export function loadBest(theme: Theme): BestRecord | null {
	if (typeof window === "undefined") return null;
	const raw = window.localStorage.getItem(bestKey(theme));
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as BestRecord;
		if (
			typeof parsed.moves === "number" &&
			typeof parsed.seconds === "number"
		) {
			return { moves: parsed.moves, seconds: parsed.seconds };
		}
		return null;
	} catch {
		return null;
	}
}

export function saveBestRecord(
	theme: Theme,
	moves: number,
	seconds: number,
): { improved: boolean; prev: BestRecord | null } {
	const prev = loadBest(theme);
	if (
		!prev ||
		moves < prev.moves ||
		(moves === prev.moves && seconds < prev.seconds)
	) {
		window.localStorage.setItem(
			bestKey(theme),
			JSON.stringify({ moves, seconds, ts: Date.now() }),
		);
		return { improved: true, prev };
	}
	return { improved: false, prev };
}

function initialState(): GameState {
	const theme = readInitialTheme();
	return {
		theme,
		sound: readInitialSound(),
		cards: buildCards(theme),
		moves: 0,
		matched: 0,
		seconds: 0,
		started: false,
		finished: false,
		busy: false,
		flipped: [],
		best: loadBest(theme),
	};
}

function reducer(state: GameState, action: Action): GameState {
	switch (action.type) {
		case "FLIP_FIRST":
			return {
				...state,
				flipped: [action.idx],
				started: true,
			};
		case "FLIP_SECOND_MATCH":
			return {
				...state,
				flipped: [],
				moves: state.moves + 1,
				matched: state.matched + 1,
				cards: state.cards.map((c) =>
					c.idx === action.a || c.idx === action.b
						? { ...c, matched: true }
						: c,
				),
			};
		case "FLIP_SECOND_MISS":
			return {
				...state,
				flipped: [action.a, action.b],
				moves: state.moves + 1,
				busy: true,
			};
		case "MISS_RESOLVED":
			return {
				...state,
				flipped: [],
				busy: false,
			};
		case "RESET":
			return {
				...state,
				cards: buildCards(state.theme),
				moves: 0,
				matched: 0,
				seconds: 0,
				started: false,
				finished: false,
				busy: false,
				flipped: [],
				best: loadBest(state.theme),
			};
		case "SET_THEME":
			return {
				...state,
				theme: action.theme,
				cards: buildCards(action.theme),
				moves: 0,
				matched: 0,
				seconds: 0,
				started: false,
				finished: false,
				busy: false,
				flipped: [],
				best: loadBest(action.theme),
			};
		case "SET_SOUND":
			return { ...state, sound: action.sound };
		case "TICK":
			return { ...state, seconds: state.seconds + 1 };
		case "FINISH":
			return { ...state, finished: true };
		default:
			return state;
	}
}

export interface FinishPayload {
	record: {
		theme: Theme;
		moves: number;
		seconds: number;
		stars: 1 | 2 | 3;
	};
	clientNonce: string;
}

export interface UseGameStateApi {
	state: GameState;
	/** Mark the first card of a new turn as flipped. */
	flipFirst: (idx: number) => void;
	/** Mark a matching pair as flipped & matched. */
	flipMatch: (a: number, b: number) => void;
	/** Mark a mismatched pair as flipped and set busy. */
	flipMiss: (a: number, b: number) => void;
	/** Resolve a miss: clear busy + flipped. */
	resolveMiss: () => void;
	newGame: () => void;
	setTheme: (t: Theme) => void;
	setSound: (on: boolean) => void;
	tick: () => void;
	finish: (stars: 1 | 2 | 3) => FinishPayload;
	/** Read the best-comparison result computed during the most recent finish(). */
	getBestResult: () => BestResult;
}

export function useGameState(): UseGameStateApi {
	const [state, dispatch] = useReducer(reducer, undefined, initialState);
	const stateRef = useRef(state);
	stateRef.current = state;
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const clientNonceRef = useRef<string>("");
	const bestResultRef = useRef<BestResult>({ improved: false, prev: null });

	// Cleanup timer on unmount
	useEffect(() => {
		return () => {
			if (timerRef.current) {
				clearInterval(timerRef.current);
				timerRef.current = null;
			}
		};
	}, []);

	// Manage timer based on state
	useEffect(() => {
		if (state.started && !state.finished && !timerRef.current) {
			timerRef.current = setInterval(() => {
				dispatch({ type: "TICK" });
			}, 1000);
		}
		if (state.finished && timerRef.current) {
			clearInterval(timerRef.current);
			timerRef.current = null;
		}
	}, [state.started, state.finished]);

	const newGame = useCallback(() => {
		if (timerRef.current) {
			clearInterval(timerRef.current);
			timerRef.current = null;
		}
		clientNonceRef.current = crypto.randomUUID();
		bestResultRef.current = { improved: false, prev: null };
		dispatch({ type: "RESET" });
	}, []);

	const setTheme = useCallback((t: Theme) => {
		if (timerRef.current) {
			clearInterval(timerRef.current);
			timerRef.current = null;
		}
		clientNonceRef.current = crypto.randomUUID();
		window.localStorage.setItem(STORAGE_THEME, t);
		bestResultRef.current = { improved: false, prev: null };
		dispatch({ type: "SET_THEME", theme: t });
	}, []);

	const setSound = useCallback((on: boolean) => {
		window.localStorage.setItem(STORAGE_SOUND, on ? "1" : "0");
		dispatch({ type: "SET_SOUND", sound: on });
	}, []);

	const tick = useCallback(() => {
		dispatch({ type: "TICK" });
	}, []);

	const flipFirst = useCallback((idx: number) => {
		dispatch({ type: "FLIP_FIRST", idx });
	}, []);

	const flipMatch = useCallback((a: number, b: number) => {
		dispatch({ type: "FLIP_SECOND_MATCH", a, b });
	}, []);

	const flipMiss = useCallback((a: number, b: number) => {
		dispatch({ type: "FLIP_SECOND_MISS", a, b });
	}, []);

	const resolveMiss = useCallback(() => {
		dispatch({ type: "MISS_RESOLVED" });
	}, []);

	const finish = useCallback((stars: 1 | 2 | 3): FinishPayload => {
		const cur = stateRef.current;
		const result = saveBestRecord(cur.theme, cur.moves, cur.seconds);
		bestResultRef.current = { improved: result.improved, prev: result.prev };
		dispatch({ type: "FINISH" });
		if (!clientNonceRef.current) {
			clientNonceRef.current = crypto.randomUUID();
		}
		return {
			record: {
				theme: cur.theme,
				moves: cur.moves,
				seconds: cur.seconds,
				stars,
			},
			clientNonce: clientNonceRef.current,
		};
	}, []);

	const getBestResult = useCallback(() => bestResultRef.current, []);

	return {
		state,
		flipFirst,
		flipMatch,
		flipMiss,
		resolveMiss,
		newGame,
		setTheme,
		setSound,
		tick,
		finish,
		getBestResult,
	};
}
