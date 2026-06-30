import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@x-game/ui/components/button";
import { MemoryMatchGame } from "@/components/game";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/game")({
	component: GameRoute,
});

function GameRoute() {
	const { data: session } = authClient.useSession();
	return (
		<div className="container mx-auto max-w-3xl px-4 py-6">
			{!session && (
				<div className="mb-4 flex items-center justify-between rounded-md border bg-muted/40 px-4 py-3 text-sm">
					<span>你正在以访客身份试玩 · 登录后可保存成绩并上榜</span>
					<Link to="/login">
						<Button variant="outline" size="sm">
							登录 / 注册
						</Button>
					</Link>
				</div>
			)}
			<MemoryMatchGame />
		</div>
	);
}
