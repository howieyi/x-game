import { createFileRoute } from "@tanstack/react-router";
import { GameFrame } from "@/components/arcade/game-frame";
import { StarDrift } from "@/components/arcade/star-drift";

export const Route = createFileRoute("/arena-3d")({
	component: Arena3D,
});

function Arena3D() {
	return (
		<GameFrame
			eyebrow="THREE.JS / WEBGL"
			title="星轨竞速"
			description="驾驶星舰在无尽量子赛道中闪避数据立方体。场景、材质、光照、雾效与实时碰撞全部由 Three.js 原生渲染。"
			color="violet"
		>
			<StarDrift />
		</GameFrame>
	);
}
