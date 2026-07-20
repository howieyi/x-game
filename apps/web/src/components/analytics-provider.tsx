import { useLocation } from "@tanstack/react-router";
import { useEffect } from "react";

import { initializeAnalytics, track } from "@/lib/analytics";

export function AnalyticsProvider() {
	const href = useLocation({ select: (location) => location.href });

	useEffect(() => initializeAnalytics(), []);

	useEffect(() => {
		track({
			eventType: "page_view",
			eventName: "page_view",
			path: href,
		});
	}, [href]);

	return null;
}
