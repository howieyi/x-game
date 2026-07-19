import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { env } from "@x-game/env/server";

const sns = new SNSClient({});

type CompletedGame = {
	eventId: string;
	userId: string;
	gameId: string;
	score: number;
	durationSeconds: number;
};

export async function publishGameCompleted(
	input: CompletedGame,
): Promise<void> {
	if (!env.GAME_EVENTS_TOPIC_ARN) {
		console.info("[game.events] topic is not configured; skipping publish");
		return;
	}

	await sns.send(
		new PublishCommand({
			TopicArn: env.GAME_EVENTS_TOPIC_ARN,
			Message: JSON.stringify({
				eventType: "game.session.completed",
				eventId: input.eventId,
				occurredAt: new Date().toISOString(),
				payload: {
					gameId: input.gameId,
					userId: input.userId,
					score: input.score,
					durationSeconds: input.durationSeconds,
				},
			}),
			MessageAttributes: {
				eventType: {
					DataType: "String",
					StringValue: "game.session.completed",
				},
			},
		}),
	);
}
