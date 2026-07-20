import { useEffect, useRef, useState } from "react";

export function NeonRunner() {
	const mountRef = useRef<HTMLDivElement>(null);
	const [status, setStatus] = useState("收集能量核心，避开红色防火墙");

	useEffect(() => {
		let game: import("phaser").Game | undefined;
		let cancelled = false;

		void import("phaser").then(({ default: Phaser }) => {
			if (cancelled || !mountRef.current) return;

			class NeonScene extends Phaser.Scene {
				private player!: import("phaser").Types.Physics.Arcade.SpriteWithDynamicBody;
				private cursors!: import("phaser").Types.Input.Keyboard.CursorKeys;
				private wasd!: Record<string, import("phaser").Input.Keyboard.Key>;
				private score = 0;
				private scoreText!: import("phaser").GameObjects.Text;

				create() {
					this.cameras.main.setBackgroundColor("#060a12");
					const g = this.add.graphics();
					g.lineStyle(1, 0x16d9ff, 0.13);
					for (let x = 0; x <= 960; x += 48) g.lineBetween(x, 0, x, 540);
					for (let y = 0; y <= 540; y += 48) g.lineBetween(0, y, 960, y);

					g.fillStyle(0x22d3ee).fillCircle(12, 12, 12);
					g.generateTexture("runner", 24, 24);
					g.clear().fillStyle(0xf43f5e).fillRoundedRect(0, 0, 24, 72, 6);
					g.generateTexture("wall", 24, 72);
					g.clear().fillStyle(0xfacc15).fillCircle(8, 8, 8);
					g.generateTexture("core", 16, 16);
					g.destroy();

					this.player = this.physics.add.sprite(110, 270, "runner");
					this.player.setCollideWorldBounds(true).setMaxVelocity(290);
					const keyboard = this.input.keyboard;
					if (!keyboard) return;
					this.cursors = keyboard.createCursorKeys();
					this.wasd = keyboard.addKeys("W,A,S,D") as Record<
						string,
						import("phaser").Input.Keyboard.Key
					>;
					this.scoreText = this.add.text(24, 20, "ENERGY 000", {
						fontFamily: "monospace",
						fontSize: "18px",
						color: "#67e8f9",
					});

					const hazards = this.physics.add.group();
					const cores = this.physics.add.group();
					for (let i = 0; i < 7; i++) {
						hazards.create(260 + i * 100, 75 + ((i * 89) % 390), "wall");
						cores.create(200 + i * 105, 60 + ((i * 131) % 420), "core");
					}
					this.physics.add.overlap(this.player, cores, (_p, core) => {
						core.destroy();
						this.score += 100;
						this.scoreText.setText(
							`ENERGY ${String(this.score).padStart(3, "0")}`,
						);
						setStatus(this.score === 700 ? "区域净化完成！" : "能量核心已同步");
					});
					this.physics.add.overlap(this.player, hazards, () => {
						this.player.setPosition(110, 270).setVelocity(0);
						this.score = Math.max(0, this.score - 50);
						this.scoreText.setText(
							`ENERGY ${String(this.score).padStart(3, "0")}`,
						);
						setStatus("遭遇防火墙，能量 -50");
					});
				}

				update() {
					const left = this.cursors.left.isDown || this.wasd.A.isDown;
					const right = this.cursors.right.isDown || this.wasd.D.isDown;
					const up = this.cursors.up.isDown || this.wasd.W.isDown;
					const down = this.cursors.down.isDown || this.wasd.S.isDown;
					this.player.setAcceleration(
						left ? -520 : right ? 520 : 0,
						up ? -520 : down ? 520 : 0,
					);
					this.player.setDrag(650);
				}
			}

			game = new Phaser.Game({
				type: Phaser.AUTO,
				parent: mountRef.current,
				width: 960,
				height: 540,
				backgroundColor: "#060a12",
				physics: { default: "arcade", arcade: { debug: false } },
				scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
				scene: NeonScene,
				input: { keyboard: { capture: [32, 37, 38, 39, 40] } },
			});
		});

		return () => {
			cancelled = true;
			game?.destroy(true);
		};
	}, []);

	return (
		<div className="flex h-full w-full flex-col overflow-hidden">
			<div
				ref={mountRef}
				className="min-h-0 w-full flex-1 overflow-hidden rounded-xl"
			/>
			<p className="mt-2 shrink-0 text-center font-medium text-[11px] text-white/45 tracking-wide">
				{status}
			</p>
		</div>
	);
}
