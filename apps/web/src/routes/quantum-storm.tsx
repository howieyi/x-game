import { createFileRoute } from "@tanstack/react-router";
import { GameFrame } from "@/components/arcade/game-frame";
import { QuantumStorm } from "@/components/arcade/quantum-storm";

export const Route = createFileRoute("/quantum-storm")({
	component: QuantumStormPage,
});

function QuantumStormPage() {
	return (
		<GameFrame
			eyebrow="PHASER 2D / SURVIVAL SHOOTER"
			title="量子风暴"
			description="在不断收缩的量子包围圈中自由移动、鼠标瞄准并击退多类型敌群。连续击破可提升倍率，精英单位、护盾电池与动态波次构成完整生存循环。"
			color="violet"
			controls="WASD 移动 · 鼠标瞄准 · 左键 / 空格射击"
		>
			<QuantumStorm />
		</GameFrame>
	);
}
