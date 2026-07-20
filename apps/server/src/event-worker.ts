import { processAnalyticsAnomalies } from "@x-game/api/services/analytics-alerts";
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

type AnalyticsAlertEvent = {
	eventType: "analytics.anomalies.detected";
	eventId: string;
	occurredAt: string;
	payload: {
		eventIds: string[];
	};
};

type PlatformEvent = GameEvent | AnalyticsAlertEvent;

function parseRecord(record: SQSRecord): PlatformEvent {
	const snsEnvelope = JSON.parse(record.body) as { Message?: string };
	const rawMessage = snsEnvelope.Message ?? record.body;
	const event = JSON.parse(rawMessage) as PlatformEvent;

	if (!event.eventId) {
		throw new Error(`Unsupported game event in message ${record.messageId}`);
	}
	if (event.eventType === "analytics.anomalies.detected") {
		if (
			!Array.isArray(event.payload.eventIds) ||
			event.payload.eventIds.length === 0 ||
			event.payload.eventIds.length > 50 ||
			event.payload.eventIds.some(
				(id) => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id),
			)
		) {
			throw new Error(`Invalid analytics event in message ${record.messageId}`);
		}
		return event;
	}
	if (event.eventType !== "game.session.completed") {
		throw new Error(
			`Unsupported platform event in message ${record.messageId}`,
		);
	}
	return event;
}

export const handler = async (event: SQSEvent) => {
	const failures: Array<{ itemIdentifier: string }> = [];

	for (const record of event.Records) {
		try {
			const platformEvent = parseRecord(record);
			if (platformEvent.eventType === "analytics.anomalies.detected") {
				await processAnalyticsAnomalies(platformEvent.payload.eventIds);
				console.log(
					JSON.stringify({
						message: "analytics alert event processed",
						eventId: platformEvent.eventId,
						behaviorEventCount: platformEvent.payload.eventIds.length,
					}),
				);
			} else {
				console.log(
					JSON.stringify({
						message: "game event processed",
						eventId: platformEvent.eventId,
						gameId: platformEvent.payload.gameId,
						score: platformEvent.payload.score,
					}),
				);
			}
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
