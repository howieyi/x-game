import { createFileRoute } from "@tanstack/react-router";
import { GameFrame } from "@/components/arcade/game-frame";
import { GravityRift } from "@/components/arcade/gravity-rift";

export const Route = createFileRoute("/gravity-rift")({
	component: GravityRiftPage,
});

function GravityRiftPage() {
	return (
		<GameFrame
			eyebrow="PHASER 2D / GRAVITY RUNNER"
			title="重力裂隙"
			description="在持续加速的霓虹隧道中一键反转重力，贴地或贴顶闪过尖刺、激光与组合障碍。收集裂隙碎片并维持同步次数，挑战更远距离。"
			color="violet"
			controls="空格 / 点击翻转重力 · R 重新开始"
		>
			<GravityRift />
		</GameFrame>
	);
}
