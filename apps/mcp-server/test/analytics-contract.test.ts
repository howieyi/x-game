import { behaviorBatchInputSchema } from "@x-game/api/analytics-contract";
import { describe, expect, it } from "vitest";

function event(overrides: Record<string, unknown> = {}) {
	return {
		id: "019f7800-02ec-71f2-b147-732793443c52",
		eventType: "performance",
		eventName: "LCP",
		sessionId: "019f7800-02ec-71f2-b147-732793443c53",
		anonymousId: "019f7800-02ec-71f2-b147-732793443c54",
		path: "/games",
		properties: { value: 1234 },
		occurredAt: new Date().toISOString(),
		...overrides,
	};
}

describe("client analytics contract", () => {
	it("accepts a numeric performance event", () => {
		expect(
			behaviorBatchInputSchema.safeParse({ events: [event()] }).success,
		).toBe(true);
	});

	it.each([
		"signup",
		"first_play",
	])("rejects server-only event type %s", (eventType) => {
		expect(
			behaviorBatchInputSchema.safeParse({
				events: [event({ eventType })],
			}).success,
		).toBe(false);
	});

	it("rejects non-numeric performance values", () => {
		expect(
			behaviorBatchInputSchema.safeParse({
				events: [event({ properties: { value: "not-a-number" } })],
			}).success,
		).toBe(false);
	});
});
