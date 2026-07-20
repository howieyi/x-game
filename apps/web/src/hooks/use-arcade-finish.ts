import type { GameId } from "@x-game/db/schema/game";
import { useCallback } from "react";
import { toast } from "sonner";

import { markFirstPlay, track } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";

import { useGameSubmit } from "./use-game-submit";

export interface ArcadeFinishResult {
	// Universal score to upload.
	score: number;
	// Wall-clock seconds from the run's first frame to the end frame.
	durationSeconds: number;
	// Game-specific extra metrics (kills, distance, flips, ...). The hook
	// folds `durationSeconds` into the same metrics blob the server stores.
	metrics?: Record<string, unknown>;
}

// Shared finish handler for every arcade game. Wraps `useGameSubmit` with the
// arcade-specific boilerplate: a generated client nonce, `durationSeconds`
// folded into metrics, and a "not logged in" toast that mirrors the
// memory-match UI copy.
//
// Game-specific scene code just calls `onFinish({ score, durationSeconds,
// metrics })` once the run ends; this hook takes care of persistence.
export function useArcadeFinish(gameId: GameId) {
	const { submit } = useGameSubmit();
	const { data: session } = authClient.useSession();

	return useCallback(
		({ score, durationSeconds, metrics = {} }: ArcadeFinishResult) => {
			if (!session) {
				toast("匿名试玩不入库 · 登录后可保存成绩", { icon: "ℹ️" });
				return;
			}
			if (markFirstPlay(gameId)) {
				track({ eventType: "first_play", eventName: gameId });
			}
			void submit({
				gameId,
				score,
				metrics: { durationSeconds, ...metrics },
				clientNonce: crypto.randomUUID(),
			});
		},
		[gameId, submit, session],
	);
}

// Helper used by Phaser scenes to retrieve a callback registered on the
// game's registry by the React wrapper.
export function readRegistryFinish<T>(
	registry: { get(key: string): unknown } | undefined,
): ((result: T) => void) | undefined {
	if (!registry) return undefined;
	const cb = registry.get("onFinish");
	return typeof cb === "function" ? (cb as (result: T) => void) : undefined;
}
