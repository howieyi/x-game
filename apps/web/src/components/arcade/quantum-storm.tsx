import { useEffect, useRef, useState } from "react";

const INITIAL_STATUS = "拖动鼠标瞄准，按住左键或空格发射";

export function QuantumStorm() {
	const mountRef = useRef<HTMLDivElement>(null);
	const [status, setStatus] = useState(INITIAL_STATUS);

	useEffect(() => {
		let game: import("phaser").Game | undefined;
		let cancelled = false;

		void import("phaser").then(({ default: Phaser }) => {
			if (cancelled || !mountRef.current) return;

			type ArcadeSprite =
				import("phaser").Types.Physics.Arcade.SpriteWithDynamicBody;

			class QuantumStormScene extends Phaser.Scene {
				private player!: ArcadeSprite;
				private bullets!: import("phaser").Physics.Arcade.Group;
				private enemies!: import("phaser").Physics.Arcade.Group;
				private pickups!: import("phaser").Physics.Arcade.Group;
				private cursors!: import("phaser").Types.Input.Keyboard.CursorKeys;
				private keys!: Record<string, import("phaser").Input.Keyboard.Key>;
				private hud!: import("phaser").GameObjects.Text;
				private waveText!: import("phaser").GameObjects.Text;
				private shieldRing!: import("phaser").GameObjects.Arc;
				private exhaust!: import("phaser").GameObjects.Particles.ParticleEmitter;
				private lastShot = 0;
				private lastSpawn = 0;
				private score = 0;
				private combo = 1;
				private shield = 100;
				private wave = 1;
				private defeated = 0;
				private gameOver = false;

				create() {
					this.cameras.main.setBackgroundColor("#03050d");
					this.drawArena();
					this.createTextures();

					this.bullets = this.physics.add.group({
						classType: Phaser.Physics.Arcade.Image,
						maxSize: 80,
					});
					this.enemies = this.physics.add.group();
					this.pickups = this.physics.add.group();
					this.player = this.physics.add
						.sprite(480, 270, "quantum-ship")
						.setCollideWorldBounds(true)
						.setDrag(700)
						.setMaxVelocity(330);
					this.player.body.setCircle(13, 7, 7);

					this.shieldRing = this.add
						.circle(this.player.x, this.player.y, 27)
						.setStrokeStyle(2, 0x52f7ff, 0.65);
					this.exhaust = this.add.particles(0, 0, "quantum-spark", {
						speed: { min: 20, max: 70 },
						scale: { start: 0.8, end: 0 },
						alpha: { start: 0.8, end: 0 },
						lifespan: 360,
						blendMode: Phaser.BlendModes.ADD,
						frequency: 35,
						quantity: 1,
					});
					this.exhaust.startFollow(this.player);

					const keyboard = this.input.keyboard;
					if (!keyboard) return;
					this.cursors = keyboard.createCursorKeys();
					this.keys = keyboard.addKeys("W,A,S,D,SPACE,R") as Record<
						string,
						import("phaser").Input.Keyboard.Key
					>;

					this.physics.add.overlap(
						this.bullets,
						this.enemies,
						this.hitEnemy,
						undefined,
						this,
					);
					this.physics.add.overlap(
						this.player,
						this.enemies,
						this.hitPlayer,
						undefined,
						this,
					);
					this.physics.add.overlap(
						this.player,
						this.pickups,
						this.collectPickup,
						undefined,
						this,
					);

					this.hud = this.add.text(24, 20, "", {
						fontFamily: "monospace",
						fontSize: "15px",
						color: "#8ffaff",
						stroke: "#031017",
						strokeThickness: 4,
					});
					this.waveText = this.add
						.text(936, 22, "WAVE 01", {
							fontFamily: "monospace",
							fontSize: "15px",
							color: "#f0abfc",
						})
						.setOrigin(1, 0);
					this.refreshHud();

					this.add
						.text(480, 500, "SURVIVE // MULTIPLY // OVERDRIVE", {
							fontFamily: "monospace",
							fontSize: "10px",
							color: "#ffffff",
							letterSpacing: 4,
						})
						.setAlpha(0.25)
						.setOrigin(0.5);
				}

				private drawArena() {
					const grid = this.add.graphics();
					grid.lineStyle(1, 0x38bdf8, 0.08);
					for (let x = 0; x <= 960; x += 48) grid.lineBetween(x, 0, x, 540);
					for (let y = 0; y <= 540; y += 48) grid.lineBetween(0, y, 960, y);
					grid.lineStyle(2, 0xd946ef, 0.08);
					for (let radius = 90; radius < 450; radius += 90) {
						grid.strokeCircle(480, 270, radius);
					}
					for (let i = 0; i < 36; i++) {
						const star = this.add.circle(
							Phaser.Math.Between(10, 950),
							Phaser.Math.Between(10, 530),
							Phaser.Math.Between(1, 2),
							i % 3 === 0 ? 0xe879f9 : 0x67e8f9,
							Phaser.Math.FloatBetween(0.18, 0.65),
						);
						this.tweens.add({
							targets: star,
							alpha: 0.08,
							duration: Phaser.Math.Between(700, 1700),
							yoyo: true,
							repeat: -1,
						});
					}
				}

				private createTextures() {
					const g = this.add.graphics();
					g.fillStyle(0x67e8f9).fillTriangle(32, 0, 0, 15, 32, 30);
					g.fillStyle(0xffffff, 0.9).fillTriangle(25, 8, 8, 15, 25, 22);
					g.generateTexture("quantum-ship", 34, 30);
					g.clear().fillStyle(0x9ffcff).fillRoundedRect(0, 0, 18, 5, 2);
					g.generateTexture("quantum-bolt", 18, 5);
					g.clear().fillStyle(0x67e8f9).fillCircle(3, 3, 3);
					g.generateTexture("quantum-spark", 6, 6);
					g.clear();
					g.lineStyle(3, 0xf472b6, 1).strokeCircle(16, 16, 13);
					g.fillStyle(0x701a75, 0.55).fillCircle(16, 16, 10);
					g.generateTexture("quantum-drone", 32, 32);
					g.clear();
					g.fillStyle(0xfb7185).fillTriangle(20, 0, 0, 11, 20, 22);
					g.fillStyle(0xffffff, 0.8).fillCircle(10, 11, 3);
					g.generateTexture("quantum-hunter", 22, 22);
					g.clear();
					g.lineStyle(5, 0xc084fc, 1).strokeCircle(28, 28, 23);
					g.lineStyle(2, 0xffffff, 0.8).strokeCircle(28, 28, 13);
					g.generateTexture("quantum-elite", 56, 56);
					g.clear();
					g.fillStyle(0x34d399).fillCircle(10, 10, 9);
					g.lineStyle(2, 0xffffff, 0.8).strokeCircle(10, 10, 6);
					g.generateTexture("quantum-cell", 20, 20);
					g.destroy();
				}

				update(time: number) {
					if (this.gameOver) {
						if (Phaser.Input.Keyboard.JustDown(this.keys.R)) {
							this.scene.restart();
							setStatus(INITIAL_STATUS);
						}
						return;
					}

					const left = this.cursors.left.isDown || this.keys.A.isDown;
					const right = this.cursors.right.isDown || this.keys.D.isDown;
					const up = this.cursors.up.isDown || this.keys.W.isDown;
					const down = this.cursors.down.isDown || this.keys.S.isDown;
					this.player.setAcceleration(
						left ? -760 : right ? 760 : 0,
						up ? -760 : down ? 760 : 0,
					);

					const pointer = this.input.activePointer;
					const angle = Phaser.Math.Angle.Between(
						this.player.x,
						this.player.y,
						pointer.worldX,
						pointer.worldY,
					);
					this.player.setRotation(angle);
					if (
						(pointer.isDown || this.keys.SPACE.isDown) &&
						time > this.lastShot + 115
					) {
						this.fire(angle);
						this.lastShot = time;
					}

					const spawnDelay = Math.max(280, 860 - this.wave * 65);
					if (time > this.lastSpawn + spawnDelay) {
						this.spawnEnemy();
						this.lastSpawn = time;
					}
					this.shieldRing
						.setPosition(this.player.x, this.player.y)
						.setAlpha(0.18 + this.shield / 160);
					this.recycleObjects();
				}

				private fire(angle: number) {
					const bullet = this.bullets.get(
						this.player.x,
						this.player.y,
						"quantum-bolt",
					) as ArcadeSprite | null;
					if (!bullet) return;
					bullet
						.setActive(true)
						.setVisible(true)
						.setRotation(angle)
						.setTint(this.combo >= 4 ? 0xf0abfc : 0x9ffcff);
					bullet.body.enable = true;
					this.physics.velocityFromRotation(angle, 720, bullet.body.velocity);
				}

				private spawnEnemy() {
					const edge = Phaser.Math.Between(0, 3);
					const x =
						edge === 0 ? -30 : edge === 1 ? 990 : Phaser.Math.Between(0, 960);
					const y =
						edge === 2 ? -30 : edge === 3 ? 570 : Phaser.Math.Between(0, 540);
					const elite = this.wave % 4 === 0 && Phaser.Math.Between(0, 8) === 0;
					const hunter = !elite && Phaser.Math.Between(0, 3) === 0;
					const enemy = this.enemies.create(
						x,
						y,
						elite
							? "quantum-elite"
							: hunter
								? "quantum-hunter"
								: "quantum-drone",
					) as ArcadeSprite;
					enemy.setData("hp", elite ? 10 : hunter ? 3 : 2);
					enemy.setData("value", elite ? 1200 : hunter ? 300 : 160);
					enemy.setData(
						"speed",
						elite ? 58 : hunter ? 145 : 90 + this.wave * 6,
					);
					enemy.setAngularVelocity(elite ? 35 : hunter ? 150 : -75);
					enemy.body.setCircle(enemy.width * 0.38);
					const angle = Phaser.Math.Angle.Between(
						x,
						y,
						this.player.x,
						this.player.y,
					);
					this.physics.velocityFromRotation(
						angle,
						enemy.getData("speed"),
						enemy.body.velocity,
					);
				}

				private hitEnemy(bulletObject: unknown, enemyObject: unknown) {
					const bullet = bulletObject as ArcadeSprite;
					const enemy = enemyObject as ArcadeSprite;
					bullet.disableBody(true, true);
					const hp = (enemy.getData("hp") as number) - 1;
					enemy.setData("hp", hp).setTintFill(0xffffff);
					this.time.delayedCall(45, () => enemy.active && enemy.clearTint());
					if (hp > 0) return;

					const value = (enemy.getData("value") as number) * this.combo;
					this.score += value;
					this.defeated += 1;
					this.combo = Math.min(8, this.combo + 1);
					this.burst(enemy.x, enemy.y, enemy.texture.key === "quantum-elite");
					if (Phaser.Math.Between(0, 8) === 0) {
						this.pickups.create(enemy.x, enemy.y, "quantum-cell");
					}
					enemy.destroy();
					if (this.defeated >= this.wave * 10) {
						this.wave += 1;
						this.combo = Math.max(2, this.combo);
						this.waveText.setText(`WAVE ${String(this.wave).padStart(2, "0")}`);
						this.cameras.main.flash(180, 42, 215, 255, false);
						setStatus(`第 ${this.wave} 波入侵 · 敌群速度提升`);
					}
					this.refreshHud();
				}

				private hitPlayer(_playerObject: unknown, enemyObject: unknown) {
					const enemy = enemyObject as ArcadeSprite;
					if (!enemy.active) return;
					this.shield -= enemy.texture.key === "quantum-elite" ? 45 : 22;
					this.combo = 1;
					this.cameras.main.shake(180, 0.012);
					this.cameras.main.flash(120, 255, 28, 88, false);
					this.burst(enemy.x, enemy.y, false);
					enemy.destroy();
					if (this.shield <= 0) this.endRun();
					else setStatus(`护盾受损 · 剩余 ${this.shield}%`);
					this.refreshHud();
				}

				private collectPickup(_playerObject: unknown, pickupObject: unknown) {
					const pickup = pickupObject as ArcadeSprite;
					this.shield = Math.min(100, this.shield + 28);
					this.score += 500;
					this.cameras.main.flash(100, 52, 211, 153, false);
					pickup.destroy();
					setStatus("量子电池接入 · 护盾恢复");
					this.refreshHud();
				}

				private burst(x: number, y: number, elite: boolean) {
					const particles = this.add.particles(x, y, "quantum-spark", {
						speed: { min: 70, max: elite ? 300 : 190 },
						scale: { start: elite ? 1.8 : 1.1, end: 0 },
						alpha: { start: 1, end: 0 },
						lifespan: 430,
						quantity: elite ? 24 : 12,
						blendMode: Phaser.BlendModes.ADD,
						emitting: false,
					});
					particles.explode(elite ? 24 : 12);
					this.time.delayedCall(500, () => particles.destroy());
				}

				private recycleObjects() {
					for (const bullet of this.bullets.getChildren() as ArcadeSprite[]) {
						if (
							bullet.active &&
							(bullet.x < -30 ||
								bullet.x > 990 ||
								bullet.y < -30 ||
								bullet.y > 570)
						) {
							bullet.disableBody(true, true);
						}
					}
					for (const enemy of this.enemies.getChildren() as ArcadeSprite[]) {
						if (!enemy.active) continue;
						const angle = Phaser.Math.Angle.Between(
							enemy.x,
							enemy.y,
							this.player.x,
							this.player.y,
						);
						this.physics.velocityFromRotation(
							angle,
							enemy.getData("speed") as number,
							enemy.body.velocity,
						);
					}
				}

				private refreshHud() {
					this.hud?.setText(
						`SCORE ${String(this.score).padStart(7, "0")}   SHIELD ${Math.max(0, this.shield)}%   COMBO x${this.combo}`,
					);
				}

				private endRun() {
					this.gameOver = true;
					this.player.setTint(0xfb7185).setVelocity(0).setAcceleration(0);
					this.exhaust.stop();
					this.add
						.rectangle(480, 270, 470, 150, 0x050713, 0.94)
						.setStrokeStyle(1, 0xf472b6, 0.7);
					this.add
						.text(
							480,
							250,
							`SIGNAL LOST\nSCORE ${String(this.score).padStart(7, "0")}`,
							{
								align: "center",
								fontFamily: "monospace",
								fontSize: "24px",
								color: "#f9a8d4",
								lineSpacing: 10,
							},
						)
						.setOrigin(0.5);
					this.add
						.text(480, 320, "按 R 重新接入", {
							fontFamily: "monospace",
							fontSize: "12px",
							color: "#ffffff",
						})
						.setAlpha(0.55)
						.setOrigin(0.5);
					setStatus(`信号中断 · 最终得分 ${this.score}`);
				}
			}

			game = new Phaser.Game({
				type: Phaser.AUTO,
				parent: mountRef.current,
				width: 960,
				height: 540,
				backgroundColor: "#03050d",
				physics: { default: "arcade", arcade: { debug: false } },
				scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
				scene: QuantumStormScene,
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
				className="min-h-0 w-full flex-1 cursor-crosshair overflow-hidden rounded-xl"
			/>
			<p className="mt-2 shrink-0 text-center font-medium text-[11px] text-white/45 tracking-wide">
				{status}
			</p>
		</div>
	);
}
