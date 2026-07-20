import { createFileRoute } from "@tanstack/react-router";
import { GameFrame } from "@/components/arcade/game-frame";
import { NeonRunner } from "@/components/arcade/neon-runner";

export const Route = createFileRoute("/arcade-2d")({
	component: Arcade2D,
});

function Arcade2D() {
	return (
		<GameFrame
			eyebrow="PHASER 2D / ARCADE"
			title="霓虹突围"
			description="驾驶量子光点穿越企业防火墙，在 2D 赛博网格中回收全部能量核心。碰撞、惯性与键盘输入均由 Phaser Arcade Physics 驱动。"
			color="cyan"
		>
			<NeonRunner />
		</GameFrame>
	);
}
