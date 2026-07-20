// 导入 React 三个常用 Hook：useEffect 用于副作用（如挂载/销毁游戏）、
// useRef 用于持有 DOM 节点和可变引用、useState 用于响应式状态。
import { useEffect, useRef, useState } from "react";

// 引入项目自定义 hook：当 arcade 小游戏结束时，把成绩上报给上层（React 层）
// 用于会话限流、重试提示、toast 反馈等统一处理。
import { useArcadeFinish } from "@/hooks/use-arcade-finish";

// 玩家刚进入游戏时显示的初始提示文案。
const INITIAL_STATUS = "点击画面或按空格翻转重力，穿越裂隙";

/**
 * GravityRift（引力裂隙）
 *
 * 一个 React + Phaser 3 的街机小游戏：
 * - 玩家是一个紫色方块（rift-runner），向右"飞行"穿越隧道。
 * - 每次点击/空格都会让重力反向，从而让角色撞向上或下的边界。
 * - 收集青色碎片（rift-shard）获得能量；撞到尖刺/激光会扣命。
 * - 共 3 条命，全部用完则游戏结束，显示分数并支持 R 键重开。
 *
 * 整体结构：
 * 1. 顶部 React 状态（status 文案）用于在不重启游戏的情况下向玩家反馈提示。
 * 2. 中间 useEffect 内动态 import('phaser')，避免 SSR 报错，并按需加载游戏引擎。
 * 3. RiftScene 是 Phaser 场景类，集中维护所有游戏逻辑。
 * 4. 卸载时必须销毁 Phaser.Game 实例，避免 WebGL 上下文泄漏。
 */
export function GravityRift() {
	// 挂载 Phaser 画布的容器 DOM 节点。
	const mountRef = useRef<HTMLDivElement>(null);
	// 当前展示给玩家的状态文案（受控于场景内部，例如受伤、失败时）。
	const [status, setStatus] = useState(INITIAL_STATUS);

	// 从上层 hook 获取"游戏结束回调"，用于把分数上报/触发结算流程。
	const onFinish = useArcadeFinish("gravity-rift");

	// 由于 Phaser 场景在闭包内运行，为避免 onFinish 变更时场景仍然引用旧函数，
	// 这里用 ref 缓存最新回调，并在 effect 里同步刷新引用。
	const onFinishRef = useRef(onFinish);
	useEffect(() => {
		onFinishRef.current = onFinish;
	}, [onFinish]);

	// 主生命周期 effect：负责加载 Phaser、创建游戏实例，并在卸载时清理。
	useEffect(() => {
		// game 持有 Phaser.Game 实例；cancelled 用于异步 import 完成后判断组件是否已经卸载。
		let game: import("phaser").Game | undefined;
		let cancelled = false;

		// 动态 import：phaser 依赖了 window/document，必须仅在客户端执行。
		void import("phaser").then(({ default: Phaser }) => {
			// 安全防御：若组件在 import 完成前已卸载，直接放弃创建。
			if (cancelled || !mountRef.current) return;

			// 类型别名：动态 body 精灵，便于下方各处复用。
			type Sprite = import("phaser").Types.Physics.Arcade.SpriteWithDynamicBody;

			/**
			 * RiftScene —— 实际的游戏场景。
			 * 内部维护贴图、障碍、碎片、HUD、物理碰撞等所有逻辑。
			 */
			class RiftScene extends Phaser.Scene {
				// ====== 游戏对象 ======
				private runner!: Sprite; // 玩家角色（紫色方块）
				private boundaries!: import("phaser").Physics.Arcade.StaticGroup; // 上下边界平台
				private hazards!: import("phaser").Physics.Arcade.Group; // 尖刺 / 激光 等危险物
				private shards!: import("phaser").Physics.Arcade.Group; // 可收集的能量碎片
				private trail!: import("phaser").GameObjects.Particles.ParticleEmitter; // 角色尾部粒子拖尾
				private space!: import("phaser").Input.Keyboard.Key; // 空格键
				private restart!: import("phaser").Input.Keyboard.Key; // 重开（R）键
				private hud!: import("phaser").GameObjects.Text; // 左上角文字 HUD

				private lines: import("phaser").GameObjects.Line[] = []; // 视差滚动的竖线，营造"隧道感"

				// ====== 游戏状态变量 ======
				private gravity = 1; // 当前重力方向：1 表示向下，-1 表示向上
				private speed = 270; // 当前横向滚动速度（像素/秒）
				private distance = 0; // 累计前进距离（米，单位为"像素换算米"）
				private energy = 0; // 当前能量（吃碎片 + 通过危险物累计）
				private lives = 3; // 剩余生命数
				private lastSpawn = 0; // 上一次生成障碍的时间戳（毫秒）
				private lastFlip = 0; // 上一次翻转重力时间戳，用于做最小翻转间隔节流
				private invulnerableUntil = 0; // 受伤后无敌期截止时间戳
				private ended = false; // 游戏是否已结束的标志位
				// ====== 回合级数据（结算上报用） ======
				private startedAt = 0; // 游戏开始时的时间戳
				private flipCount = 0; // 翻转重力总次数

				/** 场景创建入口（Phaser 在 add scene 时自动调用） */
				create() {
					// 背景设为深紫色（赛博风）。
					this.cameras.main.setBackgroundColor("#050313");
					this.createTextures(); // 程序化生成所有贴图
					this.createTunnel(); // 构建背景隧道（竖线 + 网格 + 星点）
					// 上下两条静态边界平台：用 setDisplaySize 把 32x32 的贴图拉伸成 960x32 的平台。
					this.boundaries = this.physics.add.staticGroup();
					for (const y of [16, 524]) {
						this.boundaries
							.create(480, y, "rift-platform")
							.setDisplaySize(960, 32)
							.refreshBody()
							.setTint(0x312e81);
					}
					// 创建玩家角色：从 (180, 450) 起步，初始重力向下（+1250）。
					this.runner = this.physics.add
						.sprite(180, 450, "rift-runner")
						.setGravityY(1250);
					// 调整物理盒子略小于贴图，避免边缘碰撞感太硬。
					this.runner.body.setSize(27, 27);
					// 危险物组：不受重力推动、且静止（immovable）—— 它们靠移动场景整体来制造相对运动。
					this.hazards = this.physics.add.group({
						allowGravity: false,
						immovable: true,
					});
					// 碎片组：同样静止、靠场景滚动产生运动。
					this.shards = this.physics.add.group({
						allowGravity: false,
						immovable: true,
					});
					// 玩家与上下边界的硬碰撞（撞到就停）。
					this.physics.add.collider(this.runner, this.boundaries);
					// 玩家与危险物的 overlap：进入即触发 hitHazard。
					this.physics.add.overlap(
						this.runner,
						this.hazards,
						this.hitHazard,
						undefined,
						this,
					);
					// 玩家与碎片的 overlap：进入即触发 collectShard。
					this.physics.add.overlap(
						this.runner,
						this.shards,
						this.collectShard,
						undefined,
						this,
					);
					// 角色尾部的粒子拖尾：additive 混合让色彩更亮。
					this.trail = this.add.particles(0, 0, "rift-particle", {
						speedX: { min: -110, max: -40 }, // 向左喷射
						speedY: { min: -20, max: 20 },
						scale: { start: 1, end: 0 }, // 由大变小
						alpha: { start: 0.8, end: 0 }, // 渐隐
						lifespan: 420, // 每个粒子存活 420ms
						frequency: 28, // 每 28ms 生成一颗
						blendMode: Phaser.BlendModes.ADD,
					});
					// 粒子发射器跟随在角色左侧（-18 偏移），看起来像飞行尾迹。
					this.trail.startFollow(this.runner, -18, 0);
					// 监听键盘：绑定空格（翻转重力）和 R（重开）。
					const keyboard = this.input.keyboard;
					if (!keyboard) return;
					this.space = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
					this.restart = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
					// 鼠标点按画布也触发翻转重力。
					this.input.on("pointerdown", () => this.flip(this.time.now));
					// HUD：左上角实时显示距离/能量/生命。
					this.hud = this.add.text(24, 20, "", {
						fontFamily: "monospace",
						fontSize: "15px",
						color: "#c4b5fd",
						stroke: "#070312",
						strokeThickness: 4, // 描边增强对比度
					});
					// 右上的小标识文字（品牌/章节名）。
					this.add
						.text(936, 22, "GRAVITY//LINK", {
							fontFamily: "monospace",
							fontSize: "11px",
							color: "#22d3ee",
							letterSpacing: 2,
						})
						.setOrigin(1, 0); // 右上角对齐
					// 预生成 3 个障碍模式，从屏幕右侧外进入，避免开局"空荡荡"。
					for (let i = 0; i < 3; i++) this.spawnPattern(760 + i * 350);
					// 记录回合开始时间，用于结算时计算时长。
					this.startedAt = this.time.now;
					this.refreshHud();
				}

				/**
				 * 程序化生成所有游戏贴图。
				 * 通过 Graphics 绘制矢量元素并 generateTexture 转成 texture key。
				 * 这样做的好处是：无需额外图片资源，单文件即可运行。
				 */
				private createTextures() {
					const g = this.add.graphics();
					// 玩家方块：紫色填充 + 青色描边 + 白色三角形点缀（像箭头）。
					g.fillStyle(0xa78bfa).fillRoundedRect(2, 2, 30, 30, 7);
					g.lineStyle(2, 0x67e8f9).strokeRoundedRect(2, 2, 30, 30, 7);
					g.fillStyle(0xffffff, 0.85).fillTriangle(23, 8, 23, 26, 8, 17);
					g.generateTexture("rift-runner", 34, 34);
					// 平台：深紫色矩形 + 一条亮紫色顶边。
					g.clear().fillStyle(0x312e81).fillRect(0, 0, 32, 32);
					g.lineStyle(2, 0x8b5cf6, 0.75).lineBetween(0, 1, 32, 1);
					g.generateTexture("rift-platform", 32, 32);
					// 尖刺：粉红色三角 + 一个稍小的白色高光三角。
					g.clear().fillStyle(0xfb7185).fillTriangle(0, 44, 22, 0, 44, 44);
					g.fillStyle(0xffffff, 0.72).fillTriangle(12, 36, 22, 12, 32, 36);
					g.generateTexture("rift-spike", 44, 44);
					// 激光柱：多层红白矩形叠加，形成发光条带感。
					g.clear().fillStyle(0xf43f5e, 0.3).fillRect(0, 0, 24, 180);
					g.fillStyle(0xfb7185).fillRect(8, 0, 8, 180);
					g.fillStyle(0xffffff, 0.85).fillRect(10, 0, 4, 180);
					g.generateTexture("rift-laser", 24, 180);
					// 能量碎片：青色菱形 + 白色圆心高光。
					g.clear().fillStyle(0x22d3ee).fillTriangle(10, 0, 20, 10, 10, 20);
					g.fillStyle(0x67e8f9).fillTriangle(10, 0, 0, 10, 10, 20);
					g.lineStyle(1, 0xffffff, 0.8).strokeCircle(10, 10, 6);
					g.generateTexture("rift-shard", 20, 20);
					// 拖尾粒子：小紫色圆点。
					g.clear().fillStyle(0xc4b5fd).fillCircle(3, 3, 3);
					g.generateTexture("rift-particle", 6, 6);
					// 用完即销毁 graphics，节省显存。
					g.destroy();
				}

				/**
				 * 创建背景隧道：
				 * - 18 条竖向"通道线"会做无限循环滚动，营造运动感。
				 * - 网格底纹 + 22 个随机星点（用 tween 让它们从右向左无限滚动）。
				 */
				private createTunnel() {
					// 18 条竖向紫线，间隔 64 像素。
					for (let i = 0; i < 18; i++) {
						this.lines.push(
							this.add
								.line(0, 0, i * 64, 30, i * 64, 510, 0x8b5cf6, 0.11)
								.setOrigin(0),
						);
					}
					// 水平细网格（青色，0.08 透明度）。
					const grid = this.add.graphics().lineStyle(1, 0x22d3ee, 0.08);
					for (let y = 76; y < 500; y += 56) grid.lineBetween(0, y, 960, y);
					// 22 个随机小星点：随机位置 + 随机透明度，从右向左漂移循环。
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
							repeat: -1, // 无限循环
							onRepeat: () => star.setX(980), // 一旦飘出左边，重置到右边
						});
					}
				}

				/** Phaser 每帧调用：time 是累计毫秒，delta 是本帧毫秒数。 */
				update(time: number, delta: number) {
					// 已结束时只处理 R 重开逻辑，其它逻辑全部跳过。
					if (this.ended) {
						if (Phaser.Input.Keyboard.JustDown(this.restart)) {
							this.scene.restart(); // 重新走一遍 create()
							setStatus(INITIAL_STATUS);
						}
						return;
					}
					// 空格按下则翻转重力。
					if (Phaser.Input.Keyboard.JustDown(this.space)) this.flip(time);
					// 距离累加（按速度 * delta 算，10 倍换算成"米"）。
					this.distance += (this.speed * delta) / 10000;
					// 速度随距离递增，但封顶 510，避免后期过难。
					this.speed = Math.min(510, 270 + this.distance * 0.85);
					// 计算本帧移动像素。
					const movement = (this.speed * delta) / 1000;
					// 竖线整体向左滚动；超出左侧则循环回到右侧（1152 是 18 条线总宽 + 间隔）。
					for (const line of this.lines) {
						line.x -= movement;
						if (line.x < -64) line.x += 1152;
					}
					// 让危险物 / 碎片统一左移（实现"玩家向前飞"视效）。
					this.moveObjects(movement);
					// 节流生成新障碍：间隔随速度缩短（最低 650ms）。
					if (time > this.lastSpawn + Math.max(650, 1420 - this.speed)) {
						this.spawnPattern(1020);
						this.lastSpawn = time;
					}
					// 飞出上下边界也算受伤（兜底）。
					if (this.runner.y < -70 || this.runner.y > 610) this.hitHazard();
					this.refreshHud();
				}

				/**
				 * 翻转重力：玩家按空格/点击时调用。
				 * - 节流 150ms 防止快速连按。
				 * - 同时翻转重力方向与角色 Y 速度，造成"瞬间上升/下坠"的动画。
				 * - 翻转时还会放出一圈脉冲环作为视觉反馈。
				 */
				private flip(time: number) {
					if (this.ended || time < this.lastFlip + 150) return;
					this.gravity *= -1;
					this.flipCount += 1;
					this.runner
						.setGravityY(1250 * this.gravity) // 同步重力方向
						.setVelocityY(300 * this.gravity) // 给一个向上的初速度，形成"弹起"感
						.setFlipY(this.gravity < 0); // 朝上时翻转贴图朝向
					this.lastFlip = time;
					// 在角色周围画一个扩散圆环，逐渐消失。
					const pulse = this.add
						.circle(this.runner.x, this.runner.y, 12)
						.setStrokeStyle(3, this.gravity < 0 ? 0x22d3ee : 0xa78bfa, 0.8);
					this.tweens.add({
						targets: pulse,
						radius: 48, // 从半径 12 长到 48
						alpha: 0,
						duration: 280,
						onComplete: () => pulse.destroy(), // 动画结束后回收
					});
				}

				/**
				 * 在指定 x 位置生成一组障碍 + 碎片。
				 * type 三种：0=单尖刺，1=激光，2=双尖刺（上下颠倒）。
				 * ceiling 决定尖刺/激光挂在顶还是底，对应需要玩家选择"上还是下"。
				 */
				private spawnPattern(x: number) {
					const type = Phaser.Math.Between(0, 2);
					const ceiling = Phaser.Math.Between(0, 1) === 1;
					// type===1：激光柱从顶/底垂下，必须在对面那条通道飞行。
					if (type === 1) {
						(
							this.hazards.create(
								x,
								ceiling ? 140 : 400,
								"rift-laser",
							) as Sprite
						).setData("passed", false);
						// 在激光的对面通道生成一排碎片作为奖励。
						for (let i = 0; i < 4; i++)
							this.spawnShard(x + i * 38, ceiling ? 390 : 150);
						return;
					}
					// 其它 type：尖刺。
					const spike = this.hazards.create(
						x,
						ceiling ? 54 : 486,
						"rift-spike",
					) as Sprite;
					// 如果尖刺挂顶（ceiling=true）则需要翻转朝下，让三角形朝向玩家。
					spike.setFlipY(ceiling).setData("passed", false);
					// type===2：在主尖刺 200 像素外再放一个反向尖刺（上下夹击）。
					if (type === 2) {
						const second = this.hazards.create(
							x + 200,
							ceiling ? 486 : 54,
							"rift-spike",
						) as Sprite;
						second.setFlipY(!ceiling).setData("passed", false);
					}
					// 在障碍之间撒若干碎片，type=2 时呈正弦曲线分布。
					for (let i = 0; i < (type === 2 ? 5 : 3); i++) {
						this.spawnShard(
							x + 55 + i * 40,
							type === 2 ? 270 + Math.sin(i) * 70 : ceiling ? 420 : 120,
						);
					}
				}

				/** 在 (x, y) 处生成一个会自旋的能量碎片。 */
				private spawnShard(x: number, y: number) {
					(this.shards.create(x, y, "rift-shard") as Sprite).setAngularVelocity(
						180, // 每秒 180 度
					);
				}

				/**
				 * 每帧把场景内的危险物 / 碎片统一左移。
				 * 用 updateFromGameObject() 同步物理体位置（因为它们是手动控制的）。
				 * 走出屏幕左侧 -80 / -40 即销毁，避免内存泄漏。
				 * 危险物越过玩家后标记 passed=true 并奖励 25 能量（鼓励"擦肩而过"）。
				 */
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
						// 用 sin 给 y 加一点轻微上下漂浮。
						shard.y += Math.sin((this.time.now + shard.x) / 160) * 0.35;
						if (shard.x < -40) shard.destroy();
					}
				}

				/**
				 * 玩家受伤处理（撞到危险物或飞出边界）。
				 * - 1.25 秒无敌期防止一次撞击反复扣血。
				 * - 把玩家重置回起点位置，重置速度，并做半透明闪烁。
				 * - 摄像机摇动 + 红色闪烁，强化受击反馈。
				 * - 还有命就只扣血；生命扣完进入 endRun。
				 */
				private hitHazard() {
					if (this.ended || this.time.now < this.invulnerableUntil) return;
					this.lives -= 1;
					this.invulnerableUntil = this.time.now + 1250;
					this.runner
						.setPosition(180, this.gravity > 0 ? 420 : 120) // 根据当前重力方向回到对应侧的起始点
						.setVelocity(0)
						.setAlpha(0.35); // 立即半透明
					this.tweens.add({
						targets: this.runner,
						alpha: 1,
						duration: 120,
						yoyo: true, // 来回交替
						repeat: 4, // 共 5 次闪烁（120 * 5 ≈ 600ms 视觉）
					});
					// 摄像机摇晃 + 红色闪光。
					this.cameras.main.shake(220, 0.015).flash(130, 244, 63, 94, false);
					setStatus(
						this.lives > 0
							? `相位失稳 · 剩余 ${this.lives} 次同步`
							: "重力链路断开",
					);
					if (this.lives <= 0) this.endRun();
				}

				/**
				 * 吃到能量碎片：加分 + 在碎片位置播放圆环扩散动画。
				 * _runner 是 Phaser 回调注入的 player，object 是与之重叠的物体。
				 */
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

				/** 刷新左上角 HUD：距离 + (距离*10+能量)分 + 生命槽（◆实心 ◇空心）。 */
				private refreshHud() {
					const score = Math.floor(this.distance * 10) + this.energy;
					this.hud?.setText(
						`DIST ${Math.floor(this.distance).toString().padStart(4, "0")}M   ENERGY ${score.toString().padStart(6, "0")}   SYNC ${"◆".repeat(this.lives)}${"◇".repeat(3 - this.lives)}`,
					);
				}

				/**
				 * 结束本回合：场景冻结、显示结算面板，调用 onFinishRef 上报结果。
				 * 注意：终止粒子拖尾、置灰角色自身，物理体停止（避免穿墙等奇怪行为）。
				 */
				private endRun() {
					this.ended = true;
					this.runner.setTint(0xfb7185).setVelocity(0).setGravityY(0);
					this.trail.stop();
					// 半透明紫色结算面板。
					this.add
						.rectangle(480, 270, 480, 160, 0x070313, 0.95)
						.setStrokeStyle(1, 0x8b5cf6, 0.75);
					// 计算最终得分（距离换算 + 能量）。
					const finalScore = Math.floor(this.distance * 10) + this.energy;
					// 主标题：核心崩溃 + 距离/能量。
					this.add
						.text(
							480,
							248,
							`RIFT COLLAPSED\n${Math.floor(this.distance)}M // ${finalScore} ENERGY`,
							{
								align: "center",
								fontFamily: "monospace",
								fontSize: "23px",
								color: "#c4b5fd",
								lineSpacing: 10,
							},
						)
						.setOrigin(0.5);
					// 重开提示。
					this.add
						.text(480, 324, "按 R 重启重力核心", {
							fontFamily: "monospace",
							fontSize: "12px",
							color: "#ffffff",
						})
						.setAlpha(0.55)
						.setOrigin(0.5);
					// 把本局结果交给上层 React：会话限流、重试、toast 等都由上层做。
					onFinishRef.current({
						score: finalScore,
						durationSeconds: (this.time.now - this.startedAt) / 1000,
						metrics: {
							distanceM: Math.floor(this.distance),
							energy: this.energy,
							flips: this.flipCount,
							livesRemaining: this.lives,
						},
					});
				}
			}

			// 创建 Phaser 游戏实例：960x540 画布，arcade 物理，自动识别 WebGL/Canvas。
			game = new Phaser.Game({
				type: Phaser.AUTO,
				parent: mountRef.current, // 渲染到 mountRef 指向的 div
				width: 960,
				height: 540,
				backgroundColor: "#050313",
				physics: {
					default: "arcade", // arcade 物理引擎对 2D 小游戏够用且性能好
					arcade: { debug: false, gravity: { x: 0, y: 0 } }, // 全局重力关掉，玩家由 setGravityY 单体控制
				},
				scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
				scene: RiftScene,
				input: { keyboard: { capture: [32] } }, // 主动捕获空格（避免冒泡到浏览器滚动等行为）
			});
		});
		// 清理函数：组件卸载时调用 —— 取消异步初始化并销毁 Phaser 实例。
		return () => {
			cancelled = true;
			game?.destroy(true); // 第二个参数 true 表示彻底销毁 WebGL/Canvas 上下文
		};
	}, []); // 空依赖：仅在挂载/卸载时跑一次

	// ====== React UI 部分 ======
	return (
		<div className="flex h-full w-full flex-col overflow-hidden">
			{/* 容器 div，Phaser 会把画布挂到这里。cursor-pointer 暗示可点击翻转。 */}
			<div
				ref={mountRef}
				className="min-h-0 w-full flex-1 cursor-pointer overflow-hidden rounded-xl"
			/>
			{/* 底部文案：实时反馈受伤状态 / 失败提示等，由场景内 setStatus 写入。 */}
			<p className="mt-2 shrink-0 text-center font-medium text-[11px] text-white/45 tracking-wide">
				{status}
			</p>
		</div>
	);
}
