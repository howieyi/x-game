import { useEffect, useRef, useState } from "react";

const INITIAL_STATUS = "点击画面或按空格翻转重力，穿越裂隙";

export function GravityRift() {
	const mountRef = useRef<HTMLDivElement>(null);
	const [status, setStatus] = useState(INITIAL_STATUS);

	useEffect(() => {
		let game: import("phaser").Game | undefined;
		let cancelled = false;

		void import("phaser").then(({ default: Phaser }) => {
			if (cancelled || !mountRef.current) return;
			type Sprite = import("phaser").Types.Physics.Arcade.SpriteWithDynamicBody;

			class RiftScene extends Phaser.Scene {
				private runner!: Sprite;
				private boundaries!: import("phaser").Physics.Arcade.StaticGroup;
				private hazards!: import("phaser").Physics.Arcade.Group;
				private shards!: import("phaser").Physics.Arcade.Group;
				private trail!: import("phaser").GameObjects.Particles.ParticleEmitter;
				private space!: import("phaser").Input.Keyboard.Key;
				private restart!: import("phaser").Input.Keyboard.Key;
				private hud!: import("phaser").GameObjects.Text;
				private lines: import("phaser").GameObjects.Line[] = [];
				private gravity = 1;
				private speed = 270;
				private distance = 0;
				private energy = 0;
				private lives = 3;
				private lastSpawn = 0;
				private lastFlip = 0;
				private invulnerableUntil = 0;
				private ended = false;

				create() {
					this.cameras.main.setBackgroundColor("#050313");
					this.createTextures();
					this.createTunnel();
					this.boundaries = this.physics.add.staticGroup();
					for (const y of [16, 524]) {
						this.boundaries
							.create(480, y, "rift-platform")
							.setDisplaySize(960, 32)
							.refreshBody()
							.setTint(0x312e81);
					}
					this.runner = this.physics.add
						.sprite(180, 450, "rift-runner")
						.setGravityY(1250);
					this.runner.body.setSize(27, 27);
					this.hazards = this.physics.add.group({
						allowGravity: false,
						immovable: true,
					});
					this.shards = this.physics.add.group({
						allowGravity: false,
						immovable: true,
					});
					this.physics.add.collider(this.runner, this.boundaries);
					this.physics.add.overlap(
						this.runner,
						this.hazards,
						this.hitHazard,
						undefined,
						this,
					);
					this.physics.add.overlap(
						this.runner,
						this.shards,
						this.collectShard,
						undefined,
						this,
					);
					this.trail = this.add.particles(0, 0, "rift-particle", {
						speedX: { min: -110, max: -40 },
						speedY: { min: -20, max: 20 },
						scale: { start: 1, end: 0 },
						alpha: { start: 0.8, end: 0 },
						lifespan: 420,
						frequency: 28,
						blendMode: Phaser.BlendModes.ADD,
					});
					this.trail.startFollow(this.runner, -18, 0);
					const keyboard = this.input.keyboard;
					if (!keyboard) return;
					this.space = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
					this.restart = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
					this.input.on("pointerdown", () => this.flip(this.time.now));
					this.hud = this.add.text(24, 20, "", {
						fontFamily: "monospace",
						fontSize: "15px",
						color: "#c4b5fd",
						stroke: "#070312",
						strokeThickness: 4,
					});
					this.add
						.text(936, 22, "GRAVITY//LINK", {
							fontFamily: "monospace",
							fontSize: "11px",
							color: "#22d3ee",
							letterSpacing: 2,
						})
						.setOrigin(1, 0);
					for (let i = 0; i < 3; i++) this.spawnPattern(760 + i * 350);
					this.refreshHud();
				}

				private createTextures() {
					const g = this.add.graphics();
					g.fillStyle(0xa78bfa).fillRoundedRect(2, 2, 30, 30, 7);
					g.lineStyle(2, 0x67e8f9).strokeRoundedRect(2, 2, 30, 30, 7);
					g.fillStyle(0xffffff, 0.85).fillTriangle(23, 8, 23, 26, 8, 17);
					g.generateTexture("rift-runner", 34, 34);
					g.clear().fillStyle(0x312e81).fillRect(0, 0, 32, 32);
					g.lineStyle(2, 0x8b5cf6, 0.75).lineBetween(0, 1, 32, 1);
					g.generateTexture("rift-platform", 32, 32);
					g.clear().fillStyle(0xfb7185).fillTriangle(0, 44, 22, 0, 44, 44);
					g.fillStyle(0xffffff, 0.72).fillTriangle(12, 36, 22, 12, 32, 36);
					g.generateTexture("rift-spike", 44, 44);
					g.clear().fillStyle(0xf43f5e, 0.3).fillRect(0, 0, 24, 180);
					g.fillStyle(0xfb7185).fillRect(8, 0, 8, 180);
					g.fillStyle(0xffffff, 0.85).fillRect(10, 0, 4, 180);
					g.generateTexture("rift-laser", 24, 180);
					g.clear().fillStyle(0x22d3ee).fillTriangle(10, 0, 20, 10, 10, 20);
					g.fillStyle(0x67e8f9).fillTriangle(10, 0, 0, 10, 10, 20);
					g.lineStyle(1, 0xffffff, 0.8).strokeCircle(10, 10, 6);
					g.generateTexture("rift-shard", 20, 20);
					g.clear().fillStyle(0xc4b5fd).fillCircle(3, 3, 3);
					g.generateTexture("rift-particle", 6, 6);
					g.destroy();
				}

				private createTunnel() {
					for (let i = 0; i < 18; i++) {
						this.lines.push(
							this.add
								.line(0, 0, i * 64, 30, i * 64, 510, 0x8b5cf6, 0.11)
								.setOrigin(0),
						);
					}
					const grid = this.add.graphics().lineStyle(1, 0x22d3ee, 0.08);
					for (let y = 76; y < 500; y += 56) grid.lineBetween(0, y, 960, y);
					for (let i = 0; i < 22; i++) {
						const star = this.add.circle(
							Phaser.Math.Between(0, 960),
							Phaser.Math.Between(40, 500),
							Phaser.Math.Between(1, 2),
							0xc4b5fd,
							Phaser.Math.FloatBetween(0.15, 0.55),
						);
						this.tweens.add({
							targets: star,
							x: -20,
							duration: Phaser.Math.Between(3500, 8000),
							repeat: -1,
							onRepeat: () => star.setX(980),
						});
					}
				}

				update(time: number, delta: number) {
					if (this.ended) {
						if (Phaser.Input.Keyboard.JustDown(this.restart)) {
							this.scene.restart();
							setStatus(INITIAL_STATUS);
						}
						return;
					}
					if (Phaser.Input.Keyboard.JustDown(this.space)) this.flip(time);
					this.distance += (this.speed * delta) / 10000;
					this.speed = Math.min(510, 270 + this.distance * 0.85);
					const movement = (this.speed * delta) / 1000;
					for (const line of this.lines) {
						line.x -= movement;
						if (line.x < -64) line.x += 1152;
					}
					this.moveObjects(movement);
					if (time > this.lastSpawn + Math.max(650, 1420 - this.speed)) {
						this.spawnPattern(1020);
						this.lastSpawn = time;
					}
					if (this.runner.y < -70 || this.runner.y > 610) this.hitHazard();
					this.refreshHud();
				}

				private flip(time: number) {
					if (this.ended || time < this.lastFlip + 150) return;
					this.gravity *= -1;
					this.runner
						.setGravityY(1250 * this.gravity)
						.setVelocityY(300 * this.gravity)
						.setFlipY(this.gravity < 0);
					this.lastFlip = time;
					const pulse = this.add
						.circle(this.runner.x, this.runner.y, 12)
						.setStrokeStyle(3, this.gravity < 0 ? 0x22d3ee : 0xa78bfa, 0.8);
					this.tweens.add({
						targets: pulse,
						radius: 48,
						alpha: 0,
						duration: 280,
						onComplete: () => pulse.destroy(),
					});
				}

				private spawnPattern(x: number) {
					const type = Phaser.Math.Between(0, 2);
					const ceiling = Phaser.Math.Between(0, 1) === 1;
					if (type === 1) {
						(
							this.hazards.create(
								x,
								ceiling ? 140 : 400,
								"rift-laser",
							) as Sprite
						).setData("passed", false);
						for (let i = 0; i < 4; i++)
							this.spawnShard(x + i * 38, ceiling ? 390 : 150);
						return;
					}
					const spike = this.hazards.create(
						x,
						ceiling ? 54 : 486,
						"rift-spike",
					) as Sprite;
					spike.setFlipY(ceiling).setData("passed", false);
					if (type === 2) {
						const second = this.hazards.create(
							x + 200,
							ceiling ? 486 : 54,
							"rift-spike",
						) as Sprite;
						second.setFlipY(!ceiling).setData("passed", false);
					}
					for (let i = 0; i < (type === 2 ? 5 : 3); i++) {
						this.spawnShard(
							x + 55 + i * 40,
							type === 2 ? 270 + Math.sin(i) * 70 : ceiling ? 420 : 120,
						);
					}
				}

				private spawnShard(x: number, y: number) {
					(this.shards.create(x, y, "rift-shard") as Sprite).setAngularVelocity(
						180,
					);
				}

				private moveObjects(movement: number) {
					for (const hazard of this.hazards.getChildren() as Sprite[]) {
						hazard.x -= movement;
						hazard.body.updateFromGameObject();
						if (!hazard.getData("passed") && hazard.x < this.runner.x - 30) {
							hazard.setData("passed", true);
							this.energy += 25;
						}
						if (hazard.x < -80) hazard.destroy();
					}
					for (const shard of this.shards.getChildren() as Sprite[]) {
						shard.x -= movement;
						shard.body.updateFromGameObject();
						shard.y += Math.sin((this.time.now + shard.x) / 160) * 0.35;
						if (shard.x < -40) shard.destroy();
					}
				}

				private hitHazard() {
					if (this.ended || this.time.now < this.invulnerableUntil) return;
					this.lives -= 1;
					this.invulnerableUntil = this.time.now + 1250;
					this.runner
						.setPosition(180, this.gravity > 0 ? 420 : 120)
						.setVelocity(0)
						.setAlpha(0.35);
					this.tweens.add({
						targets: this.runner,
						alpha: 1,
						duration: 120,
						yoyo: true,
						repeat: 4,
					});
					this.cameras.main.shake(220, 0.015).flash(130, 244, 63, 94, false);
					setStatus(
						this.lives > 0
							? `相位失稳 · 剩余 ${this.lives} 次同步`
							: "重力链路断开",
					);
					if (this.lives <= 0) this.endRun();
				}

				private collectShard(_runner: unknown, object: unknown) {
					const shard = object as Sprite;
					this.energy += 100;
					const pulse = this.add.circle(shard.x, shard.y, 8, 0x67e8f9, 0.7);
					this.tweens.add({
						targets: pulse,
						radius: 30,
						alpha: 0,
						duration: 260,
						onComplete: () => pulse.destroy(),
					});
					shard.destroy();
				}

				private refreshHud() {
					const score = Math.floor(this.distance * 10) + this.energy;
					this.hud?.setText(
						`DIST ${Math.floor(this.distance).toString().padStart(4, "0")}M   ENERGY ${score.toString().padStart(6, "0")}   SYNC ${"◆".repeat(this.lives)}${"◇".repeat(3 - this.lives)}`,
					);
				}

				private endRun() {
					this.ended = true;
					this.runner.setTint(0xfb7185).setVelocity(0).setGravityY(0);
					this.trail.stop();
					this.add
						.rectangle(480, 270, 480, 160, 0x070313, 0.95)
						.setStrokeStyle(1, 0x8b5cf6, 0.75);
					this.add
						.text(
							480,
							248,
							`RIFT COLLAPSED\n${Math.floor(this.distance)}M // ${Math.floor(this.distance * 10) + this.energy} ENERGY`,
							{
								align: "center",
								fontFamily: "monospace",
								fontSize: "23px",
								color: "#c4b5fd",
								lineSpacing: 10,
							},
						)
						.setOrigin(0.5);
					this.add
						.text(480, 324, "按 R 重启重力核心", {
							fontFamily: "monospace",
							fontSize: "12px",
							color: "#ffffff",
						})
						.setAlpha(0.55)
						.setOrigin(0.5);
				}
			}

			game = new Phaser.Game({
				type: Phaser.AUTO,
				parent: mountRef.current,
				width: 960,
				height: 540,
				backgroundColor: "#050313",
				physics: {
					default: "arcade",
					arcade: { debug: false, gravity: { x: 0, y: 0 } },
				},
				scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
				scene: RiftScene,
				input: { keyboard: { capture: [32] } },
			});
		});
		return () => {
			cancelled = true;
			game?.destroy(true);
		};
	}, []);

	return (
		<div className="overflow-hidden rounded-3xl border border-violet-300/15 bg-violet-300/[0.025] p-2 shadow-[0_0_100px_rgba(139,92,246,0.13)]">
			<div
				ref={mountRef}
				className="aspect-video w-full cursor-pointer overflow-hidden rounded-2xl"
			/>
			<p className="px-3 py-2 text-center font-medium text-violet-100/65 text-xs">
				{status}
			</p>
		</div>
	);
}
