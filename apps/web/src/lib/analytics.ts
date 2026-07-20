import type { BehaviorEventInput } from "@x-game/api/analytics-contract";
import { env } from "@x-game/env/web";

const STORAGE_KEY = "nexus_analytics_anonymous_id";
const SESSION_KEY = "nexus_analytics_session_id";
const queue: BehaviorEventInput[] = [];
let flushTimer: number | undefined;

function stableId(storage: Storage, key: string) {
	const existing = storage.getItem(key);
	if (existing) return existing;
	const id = crypto.randomUUID();
	storage.setItem(key, id);
	return id;
}

function baseEvent(): Pick<
	BehaviorEventInput,
	"anonymousId" | "sessionId" | "path" | "title" | "referrer" | "occurredAt"
> {
	return {
		anonymousId: stableId(localStorage, STORAGE_KEY),
		sessionId: stableId(sessionStorage, SESSION_KEY),
		path: `${location.pathname}${location.search}`.slice(0, 500),
		title: document.title.slice(0, 200),
		referrer: document.referrer.slice(0, 500) || undefined,
		occurredAt: new Date().toISOString(),
	};
}

export function track(
	event: Pick<BehaviorEventInput, "eventType" | "eventName"> &
		Partial<
			Pick<BehaviorEventInput, "target" | "properties" | "durationMs" | "path">
		>,
) {
	queue.push({
		id: crypto.randomUUID(),
		...baseEvent(),
		...event,
		properties: event.properties ?? {},
	});
	if (queue.length >= 10) void flushAnalytics();
	else scheduleFlush();
}

function scheduleFlush() {
	if (flushTimer) return;
	flushTimer = window.setTimeout(() => {
		flushTimer = undefined;
		void flushAnalytics();
	}, 5000);
}

export async function flushAnalytics(useBeacon = false) {
	if (queue.length === 0) return;
	const events = queue.splice(0, 50);
	const body = JSON.stringify({ events });
	const url = `${env.VITE_SERVER_URL}/api/analytics/events`;

	if (useBeacon && navigator.sendBeacon) {
		const sent = navigator.sendBeacon(
			url,
			// text/plain 属于 CORS safelist，可在页面关闭时跨开发端口可靠发送；
			// 服务端仍会把正文按 JSON 解析。
			new Blob([body], { type: "text/plain;charset=UTF-8" }),
		);
		if (sent) return;
	}

	try {
		const response = await fetch(url, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body,
			credentials: "include",
			keepalive: true,
		});
		if (!response.ok) queue.unshift(...events);
	} catch {
		queue.unshift(...events);
	}
}

function describeTarget(target: Element) {
	const element = target.closest<HTMLElement>(
		"button,a,[role='button'],[data-analytics-name]",
	);
	if (!element || element.closest("[data-analytics-ignore]")) return null;
	const explicit = element.dataset.analyticsName;
	const label =
		explicit ||
		element.getAttribute("aria-label") ||
		element.textContent?.replace(/\s+/g, " ").trim() ||
		element.tagName.toLowerCase();
	return {
		label: label.slice(0, 120),
		kind: element.tagName.toLowerCase(),
		href:
			element instanceof HTMLAnchorElement
				? element.getAttribute("href")?.slice(0, 200)
				: undefined,
	};
}

/**
 * Mark a game as "first played" for this browser. Returns `true` the very
 * first time it is called for a given `gameId`, `false` afterwards — the
 * caller uses the boolean to decide whether to emit a `first_play` event.
 *
 * Stored in `localStorage` rather than DB so the marker survives across
 * anonymous sessions and never gets reset by a sign-out / cache clear.
 */
const FIRST_PLAY_KEY_PREFIX = "nexus.first_play.";

export function markFirstPlay(gameId: string): boolean {
	if (typeof window === "undefined") return false;
	const key = `${FIRST_PLAY_KEY_PREFIX}${gameId}`;
	try {
		if (window.localStorage.getItem(key)) return false;
		window.localStorage.setItem(key, new Date().toISOString());
		return true;
	} catch {
		// Private mode / quota errors — fall through and treat as not first.
		return false;
	}
}

export function initializeAnalytics() {
	const onClick = (event: MouseEvent) => {
		if (!(event.target instanceof Element)) return;
		const target = describeTarget(event.target);
		if (!target) return;
		track({
			eventType: "click",
			eventName: "element_click",
			target: target.label,
			properties: { kind: target.kind, href: target.href ?? null },
		});
	};
	const onVisibility = () => {
		track({
			eventType: "visibility",
			eventName: document.visibilityState,
		});
		if (document.visibilityState === "hidden") void flushAnalytics(true);
	};
	const onError = (event: ErrorEvent) => {
		track({
			eventType: "error",
			eventName: "window_error",
			properties: {
				message: event.message.slice(0, 500),
				source: event.filename?.split("/").pop()?.slice(0, 120) ?? null,
			},
		});
	};
	const onRejection = (event: PromiseRejectionEvent) => {
		track({
			eventType: "error",
			eventName: "unhandled_rejection",
			properties: {
				message: String(
					event.reason instanceof Error ? event.reason.message : event.reason,
				).slice(0, 500),
			},
		});
	};

	document.addEventListener("click", onClick, { capture: true, passive: true });
	document.addEventListener("visibilitychange", onVisibility);
	window.addEventListener("error", onError);
	window.addEventListener("unhandledrejection", onRejection);

	const observers: PerformanceObserver[] = [];
	const observe = (
		type: string,
		callback: (entry: PerformanceEntry) => void,
	) => {
		if (!PerformanceObserver.supportedEntryTypes.includes(type)) return;
		const observer = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) callback(entry);
		});
		observer.observe({ type, buffered: true });
		observers.push(observer);
	};

	observe("largest-contentful-paint", (entry) => {
		track({
			eventType: "performance",
			eventName: "LCP",
			properties: { value: Math.round(entry.startTime) },
		});
	});
	let cls = 0;
	observe("layout-shift", (entry) => {
		const shift = entry as PerformanceEntry & {
			value: number;
			hadRecentInput: boolean;
		};
		if (!shift.hadRecentInput) cls += shift.value;
	});
	observe("event", (entry) => {
		if (entry.duration < 40) return;
		track({
			eventType: "performance",
			eventName: "INP",
			properties: { value: Math.round(entry.duration) },
		});
	});

	window.addEventListener(
		"load",
		() => {
			const navigation = performance.getEntriesByType("navigation")[0] as
				| PerformanceNavigationTiming
				| undefined;
			if (navigation) {
				track({
					eventType: "performance",
					eventName: "page_load",
					durationMs: Math.round(navigation.loadEventEnd),
					properties: {
						value: Math.round(navigation.loadEventEnd),
						ttfb: Math.round(navigation.responseStart),
					},
				});
			}
			window.setTimeout(() => {
				track({
					eventType: "performance",
					eventName: "CLS",
					properties: { value: Math.round(cls * 1000) / 1000 },
				});
			}, 3000);
		},
		{ once: true },
	);

	return () => {
		document.removeEventListener("click", onClick, true);
		document.removeEventListener("visibilitychange", onVisibility);
		window.removeEventListener("error", onError);
		window.removeEventListener("unhandledrejection", onRejection);
		for (const observer of observers) observer.disconnect();
		if (flushTimer) window.clearTimeout(flushTimer);
		void flushAnalytics(true);
	};
}
