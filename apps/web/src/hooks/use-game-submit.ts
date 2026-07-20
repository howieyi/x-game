import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { GameId } from "@x-game/db/schema/game";
import { useCallback } from "react";
import { toast } from "sonner";

import { trpc } from "@/utils/trpc";

import type { Theme } from "./use-game-state";

export interface SubmitInput {
	gameId: GameId;
	score: number;
	metrics: Record<string, unknown>;
	// memory-match only; ignored by other games.
	theme?: Theme;
	clientNonce: string;
}

export interface SubmitResult {
	record: { id: string; score: number; gameId: GameId };
	isNewBest: boolean;
	prevBest: { score: number } | null;
}

const RETRY_DELAYS_MS = [300, 800, 2000] as const;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface UseGameSubmitApi {
	submit: (input: SubmitInput) => Promise<SubmitResult | null>;
	isPending: boolean;
}

export function useGameSubmit(): UseGameSubmitApi {
	const queryClient = useQueryClient();

	const mutation = useMutation(
		trpc.game.submit.mutationOptions({
			onSuccess: () => {
				// Leaderboards / personal-best / history all live behind these
				// queries; a single submit invalidates every variant regardless
				// of which game / theme was just played.
				void queryClient.invalidateQueries({
					queryKey: trpc.game.myBest.queryKey(),
				});
				void queryClient.invalidateQueries({
					queryKey: trpc.leaderboard.list.queryKey(),
				});
				void queryClient.invalidateQueries({
					queryKey: trpc.game.myHistory.queryKey(),
				});
			},
		}),
	);

	const submit = useCallback(
		async (input: SubmitInput): Promise<SubmitResult | null> => {
			const totalAttempts = RETRY_DELAYS_MS.length + 1;
			let lastError: unknown = null;
			for (let attempt = 0; attempt < totalAttempts; attempt++) {
				try {
					const result = await mutation.mutateAsync(input);
					return {
						record: {
							id: result.record.id,
							score: result.record.score,
							gameId: result.record.gameId as GameId,
						},
						isNewBest: result.isNewBest,
						prevBest: result.prevBest ? { score: result.prevBest.score } : null,
					};
				} catch (err) {
					lastError = err;
					if (attempt < totalAttempts - 1) {
						await sleep(RETRY_DELAYS_MS[attempt]);
					}
				}
			}
			console.error("[useGameSubmit] submit failed after retries", lastError);
			toast.error("成绩未保存");
			return null;
		},
		[mutation],
	);

	return {
		submit,
		isPending: mutation.isPending,
	};
}
