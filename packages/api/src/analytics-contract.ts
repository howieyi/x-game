import { ANALYTICS_EVENT_TYPES } from "@x-game/db/schema/analytics";
import { z } from "zod";

const propertyValueSchema = z.union([
	z.string().max(500),
	z.number().finite(),
	z.boolean(),
	z.null(),
]);

export const behaviorEventInputSchema = z.object({
	id: z.string().uuid(),
	eventType: z.enum(ANALYTICS_EVENT_TYPES),
	eventName: z.string().min(1).max(80),
	sessionId: z.string().uuid(),
	anonymousId: z.string().uuid(),
	path: z.string().min(1).max(500),
	title: z.string().max(200).optional(),
	referrer: z.string().max(500).optional(),
	target: z.string().max(200).optional(),
	properties: z.record(z.string().max(60), propertyValueSchema).default({}),
	durationMs: z.number().int().min(0).max(3_600_000).optional(),
	occurredAt: z.iso.datetime(),
});

export const behaviorBatchInputSchema = z.object({
	events: z.array(behaviorEventInputSchema).min(1).max(50),
});

export type BehaviorEventInput = z.infer<typeof behaviorEventInputSchema>;
