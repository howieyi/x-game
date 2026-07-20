import { GAMES, type GameId } from "@x-game/db/schema/game";

// `GameId` is re-exported so route files can `import type { GameId } from
// "@/lib/games"` without reaching across the workspace into `@x-game/db`.
export type { GameId };

// ---------------------------------------------------------------------------
// Game metadata registry
// ---------------------------------------------------------------------------
// Front-end presentation data for every game in `GAMES`. Anything user-facing
// (label, emoji, color, theme grouping, ...) lives here so the backend stays
// UI-agnostic. Routing is intentionally the same slug as the gameId so the
// React Router route and the leaderboard query line up one-to-one.

export interface GameMeta {
	id: GameId;
	label: string;
	emoji: string;
	route: string;
	// Visual accent reused on cards / chips.
	accent: string;
	// Short description shown in tooltips and empty states.
	tagline: string;
	// Whether the game has its own internal `theme` partition. Today only
	// memory-match does — every other game is a single shared leaderboard.
	hasThemes: boolean;
}

export const GAME_META: Record<GameId, GameMeta> = {
	"memory-match": {
		id: "memory-match",
		label: "记忆矩阵",
		emoji: "🧠",
		route: "/game",
		accent: "amber",
		tagline: "配对全部牌组 · 越快越好",
		hasThemes: true,
	},
	"arcade-2d": {
		id: "arcade-2d",
		label: "霓虹突围",
		emoji: "📡",
		route: "/arcade-2d",
		accent: "cyan",
		tagline: "回收能量核心 · 躲避拦截",
		hasThemes: false,
	},
	"arena-3d": {
		id: "arena-3d",
		label: "星轨竞速",
		emoji: "🚀",
		route: "/arena-3d",
		accent: "violet",
		tagline: "驾驶星舰 · 极限闪避",
		hasThemes: false,
	},
	"quantum-storm": {
		id: "quantum-storm",
		label: "量子风暴",
		emoji: "⚡",
		route: "/quantum-storm",
		accent: "magenta",
		tagline: "守住量子护盾 · 连击破敌",
		hasThemes: false,
	},
	"gravity-rift": {
		id: "gravity-rift",
		label: "重力裂隙",
		emoji: "🌀",
		route: "/gravity-rift",
		accent: "indigo",
		tagline: "反转重力 · 穿越裂隙",
		hasThemes: false,
	},
};

// Iteration helper — keeps insertion order stable for UI rendering.
export const GAME_LIST: GameMeta[] = GAMES.map((id) => GAME_META[id]);

// Memory-match `THEMES` are a sub-dimension of the platform `GAMES`. They
// remain defined next to the game logic that uses them (`use-game-state`)
// and are re-exported here for convenience in leaderboard / stats pages.
export { THEMES, type Theme } from "@x-game/db/schema/game";
