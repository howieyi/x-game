import { createFileRoute } from "@tanstack/react-router";
import { MemoryMatchGame } from "@/components/game";
import { requireAuth } from "@/lib/require-auth";

export const Route = createFileRoute("/game")({
	component: GameRoute,
	beforeLoad: requireAuth,
});

function GameRoute() {
	return <MemoryMatchGame />;
}
