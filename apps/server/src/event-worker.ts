import type { SQSEvent, SQSRecord } from "aws-lambda";

type GameEvent = {
	eventType: "game.session.completed";
	eventId: string;
	occurredAt: string;
	payload: {
		gameId: string;
		userId: string;
		score: number;
		durationSeconds: number;
	};
};

function parseRecord(record: SQSRecord): GameEvent {
	const snsEnvelope = JSON.parse(record.body) as { Message?: string };
	const rawMessage = snsEnvelope.Message ?? record.body;
	const event = JSON.parse(rawMessage) as GameEvent;

	if (event.eventType !== "game.session.completed" || !event.eventId) {
		throw new Error(`Unsupported game event in message ${record.messageId}`);
	}
	return event;
}

export const handler = async (event: SQSEvent) => {
	const failures: Array<{ itemIdentifier: string }> = [];

	for (const record of event.Records) {
		try {
			const gameEvent = parseRecord(record);
			console.log(
				JSON.stringify({
					message: "game event processed",
					eventId: gameEvent.eventId,
					gameId: gameEvent.payload.gameId,
					score: gameEvent.payload.score,
				}),
			);
		} catch (error) {
			console.error("game event processing failed", {
				messageId: record.messageId,
				error,
			});
			failures.push({ itemIdentifier: record.messageId });
		}
	}

	return { batchItemFailures: failures };
};
