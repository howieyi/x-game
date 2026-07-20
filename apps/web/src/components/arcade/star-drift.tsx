// 三个常用 Hook：副作用挂载/卸载、可变引用、状态展示。
import { useEffect, useRef, useState } from "react";

// 引入上层 hook：游戏结束时把成绩上报（用于会话限流、重试、toast）。
import { useArcadeFinish } from "@/hooks/use-arcade-finish";

/**
 * SHIP（飞船参考点）
 *
 * 这是一个"反直觉但巧妙"的设计：
 * - 飞船在 *世界坐标* 中完全不动，永远停留在 (0, 0.65, 3)；
 * - 但相机被定位到稍后于飞船、并 lookAt 飞船，
 *   所以视觉上玩家始终在画面中央；
 * - 障碍物、赛道网格等"世界几何"会向相机方向（+Z）移动，
 *   模拟"飞船向前飞行"的效果。
 *
 * 这样做好处是：
 * - 不需要给相机做平滑/插值/边界检查；
 * - 玩家角色不需要跟随视角；
 * - 在不同尺寸的容器里，画面都"以飞船为中心"，避免边缘空白。
 */
const SHIP = { x: 0, y: 0.65, z: 3 } as const;

/**
 * StarDrift（星际漂流）
 *
 * 一个 React + Three.js 的 3D 街机小游戏：
 * - 玩家控制一架青色锥形飞船，左右移动躲避迎面飞来的粉色方块障碍；
 * - 通过障碍（z 越过飞船）得 25 分；撞上立即扣 100 并结束本局；
 * - 撞到后调用 onFinishRef 上报本局分数、时长、成功穿过的方块数、命中数。
 *
 * 关键决策：
 * - 飞船固定在世界坐标，靠相机 lookAt 让玩家始终在画面中央；
 * - 障碍物沿 +Z 方向"飘过来"，越过飞船后回收到底部（z -= 60）；
 * - 网格用 `% 2 - 10` 公式做无限滚动；
 * - ResizeObserver 监听容器尺寸变化，每次都重新设置 renderer/camera。
 */
export function StarDrift() {
	// 挂载 Three.js 画布的容器 DOM 节点。
	const mountRef = useRef<HTMLDivElement>(null);
	// 当前显示给玩家的分数（受控于主循环，撞/通过都会更新）。
	const [score, setScore] = useState(0);

	// 上层 hook：游戏结束时把成绩上报。
	const onFinish = useArcadeFinish("arena-3d");
	// 通过 ref 让动画循环拿到最新回调，避免闭包陷阱（loop 重新执行时不会重读 props）。
	const onFinishRef = useRef(onFinish);
	useEffect(() => {
		onFinishRef.current = onFinish;
	}, [onFinish]);

	// 主生命周期 effect：加载 three.js、构建场景、跑主循环，卸载时回收资源。
	useEffect(() => {
		// 防御：组件在 effect 第一行就拿 host，避免后续多次解引用。
		const host = mountRef.current;
		if (!host) return;
		// disposed 用于 async 完成时检测组件是否已经卸载。
		let disposed = false;
		let renderer: import("three").WebGLRenderer | undefined;
		// 收集所有需要在卸载时执行的清理函数，统一在 return 里调用。
		const cleanups: Array<() => void> = [];

		// 动态 import：three.js 依赖 window/document，必须仅在客户端跑。
		void import("three").then((THREE) => {
			// 组件已卸载：放弃构建，避免泄露。
			if (disposed || !host) return;

			// ====== 场景与背景 ======
			const scene = new THREE.Scene();
			scene.background = new THREE.Color(0x05060b); // 深空蓝紫
			scene.fog = new THREE.FogExp2(0x070817, 0.025); // 指数雾（远处自然隐入背景）

			// ====== 相机 ======
			// 透视相机：FOV 58°、near 0.1、far 200（覆盖远到 z = -100 的网格）。
			// aspect 暂时用 16/9，resize() 会立即基于 host 真实尺寸覆盖。
			const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 200);
			camera.position.set(0, 4, SHIP.z + 8); // 位于飞船正上方略后
			camera.lookAt(SHIP.x, SHIP.y, SHIP.z); // 看飞船所在点，画面以飞船为中心

			// ====== 渲染器 ======
			renderer = new THREE.WebGLRenderer({ antialias: true });
			// 限制像素密度，避免 4K 屏过度采样（性能 + 内存考量）。
			renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
			renderer.shadowMap.enabled = true; // 启用阴影（本场景物体未投射，可关闭但不影响）
			host.appendChild(renderer.domElement); // 挂到容器里

			// ====== 光照 ======
			// 半球光：紫红色天光 + 深蓝紫地光，营造赛博氛围。
			scene.add(new THREE.HemisphereLight(0x8b5cf6, 0x05060b, 2.2));
			// 主方向光（青色），从前上方打下来，给金属感材质打高光。
			const keyLight = new THREE.DirectionalLight(0x67e8f9, 5);
			keyLight.position.set(4, 8, 5);
			scene.add(keyLight);

			// ====== 赛道网格 ======
			// GridHelper：40x40 的网格，用紫色和深蓝分主辅线。
			// 定位到飞船前方并下沉，做成"脚下"的赛博跑道。
			const track = new THREE.GridHelper(40, 40, 0x7c3aed, 0x1e3a8a);
			track.position.set(SHIP.x, 0, SHIP.z - 11);
			scene.add(track);

			// ====== 飞船 ======
			// 锥体几何（圆锥），尖端朝前，竖直轴再旋转 90° 让它"水平向前"。
			// 用 MeshStandardMaterial（金属感 0.8 + 粗糙度 0.2）搭配自发光，看起来像霓虹金属。
			const ship = new THREE.Mesh(
				new THREE.ConeGeometry(0.55, 1.8, 5),
				new THREE.MeshStandardMaterial({
					color: 0x22d3ee,
					emissive: 0x0891b2,
					emissiveIntensity: 2,
					metalness: 0.8,
					roughness: 0.2,
				}),
			);
			ship.rotation.x = Math.PI / 2; // 锥体默认指 +Y，旋转 90° 让它指 +Z（前方）
			ship.position.set(SHIP.x, SHIP.y, SHIP.z);
			scene.add(ship);

			// ====== 障碍物方块 ======
			// 共享同一份 BoxGeometry 和材质，节省显存。
			// 预生成 12 个，沿 z 轴错开排开在最远端（SHI P.z - 5 - i*5）。
			const obstacles: import("three").Mesh[] = [];
			const geometry = new THREE.BoxGeometry(1.3, 1.3, 1.3);
			const material = new THREE.MeshStandardMaterial({
				color: 0xec4899,
				emissive: 0x9d174d,
				emissiveIntensity: 1.5,
			});
			for (let i = 0; i < 12; i++) {
				const block = new THREE.Mesh(geometry, material);
				// x 在 -5 到 5 之间铺开；z 在飞船前方一排排往后延伸。
				block.position.set(((i * 3.7) % 10) - 5, SHIP.y, SHIP.z - 5 - i * 5);
				block.rotation.set(i, i * 0.4, 0); // 每块初始略微旋转，避免完全对称
				scene.add(block);
				obstacles.push(block);
			}

			// ====== 输入 ======
			// 用 Set 记录当前按下的键（A/D 或方向键），键盘监听挂在 window 上。
			const keys = new Set<string>();
			const onKeyDown = (event: KeyboardEvent) =>
				keys.add(event.key.toLowerCase());
			const onKeyUp = (event: KeyboardEvent) =>
				keys.delete(event.key.toLowerCase());
			window.addEventListener("keydown", onKeyDown);
			window.addEventListener("keyup", onKeyUp);
			cleanups.push(
				() => window.removeEventListener("keydown", onKeyDown),
				() => window.removeEventListener("keyup", onKeyUp),
			);

			// ====== 游戏循环状态 ======
			const clock = new THREE.Clock();
			let points = 0; // 当前分数
			let elapsed = 0; // 已用秒数
			let ended = false; // 游戏是否已结束
			let obstaclesRecycled = 0; // 成功穿过（成功回收）的方块数
			let hits = 0; // 命中次数（本游戏要么 0 要么 1，因为一撞即结束）

			// 结束本回合：停动画循环并通知上层；幂等（多次调用安全）。
			const endRun = () => {
				if (ended) return;
				ended = true;
				renderer?.setAnimationLoop(null);
				onFinishRef.current({
					score: points,
					durationSeconds: elapsed,
					metrics: { obstaclesRecycled, hits },
				});
			};

			// ====== 自适应尺寸 ======
			// 容器可能随时变化（用户拖动布局、手机旋转），用 ResizeObserver 监听。
			// 防御：首次挂载时 host.clientWidth 可能是 0（浏览器还没排版），
			// 这里用 Math.max(MIN_WIDTH/HEIGHT) 给一个保底画幅，确保首帧不黑屏。
			const MIN_WIDTH = 320;
			const MIN_HEIGHT = 240;
			const resize = () => {
				const width = Math.max(MIN_WIDTH, host.clientWidth);
				const height = Math.max(MIN_HEIGHT, host.clientHeight);
				renderer?.setSize(width, height, false); // false 表示不覆盖 CSS（保持响应式）
				camera.aspect = width / height;
				camera.updateProjectionMatrix(); // aspect 变了必须重新计算投影
			};
			resize(); // 同步执行一次，保证第一帧前尺寸正确
			const observer = new ResizeObserver(resize);
			observer.observe(host);
			cleanups.push(() => observer.disconnect());

			// ====== 主渲染循环 ======
			// 推荐方式：renderer.setAnimationLoop 是 WebXR 友好的循环，
			// 等价于 requestAnimationFrame，但不需要手动管理 id。
			renderer.setAnimationLoop(() => {
				if (ended) return;
				// 把 delta 限制到 50ms，防止后台标签恢复时一次跳一大步造成"瞬移穿模"。
				const delta = Math.min(clock.getDelta(), 0.05);
				elapsed += delta;

				// ===== 玩家转向 =====
				// A / 左方向键 → -1；D / 右方向键 → +1；其它为 0。
				const direction =
					keys.has("a") || keys.has("arrowleft")
						? -1
						: keys.has("d") || keys.has("arrowright")
							? 1
							: 0;
				// 飞船 x 方向位移：clamp 在 ±5.2 防止飞出场景。
				ship.position.x = THREE.MathUtils.clamp(
					ship.position.x + direction * delta * 7, // 7 = 水平速度
					-5.2,
					5.2,
				);
				// 飞船绕 z 轴倾斜：用 lerp 平滑到目标角度，按下时倾斜 0.5 弧度，松开自然回正。
				ship.rotation.z = THREE.MathUtils.lerp(
					ship.rotation.z,
					-direction * 0.5,
					0.12,
				);

				// ===== 障碍物更新 =====
				for (const block of obstacles) {
					// 每帧向 +Z 方向移动 10 单位/秒（朝向相机，相当于"方块飞过来"）。
					block.position.z += delta * 10;
					// 自转：让方块看起来在翻滚。
					block.rotation.x += delta;
					block.rotation.y += delta * 1.3;
					// 越过飞船（z > SHIP.z + 4）→ 视为成功通过：分数 +25，回收到底部。
					if (block.position.z > SHIP.z + 4) {
						block.position.z -= 60; // 回到底部（屏外远处）
						block.position.x = Math.random() * 10 - 5; // 重新随机 x 位置
						points += 25;
						obstaclesRecycled += 1;
						setScore(points);
					}
					// 碰撞检测：AABB 简化为距离判定（绝对值差 < 阈值）。
					if (
						Math.abs(block.position.z - ship.position.z) < 1.1 &&
						Math.abs(block.position.x - ship.position.x) < 1
					) {
						// 撞到：扣 100 分（不低于 0）、计数 +1、回收方块并结束本局。
						block.position.z -= 40;
						points = Math.max(0, points - 100);
						hits += 1;
						setScore(points);
						endRun();
						return; // 退出当帧循环，避免 render 后状态不一致
					}
				}
				if (ended) return;

				// ===== 网格滚动 =====
				// 让网格沿 +Z 持续移动，配合 +10 然后 `% 2 - 10` 实现 [-10, -8) 区间的循环，
				// 视觉上看起来是无限赛道向后飞驰。
				track.position.z = ((track.position.z + delta * 10 + 10) % 2) - 10;

				// 真正把场景画到画布上。
				renderer?.render(scene, camera);
			});

			// ====== 卸载时的资源回收 ======
			cleanups.push(() => {
				// 1. 停掉动画循环（不然后续 rAF 还会跑）。
				renderer?.setAnimationLoop(null);
				// 2. 遍历整个场景树，释放所有 Mesh 的 geometry + material。
				scene.traverse((object) => {
					if (object instanceof THREE.Mesh) {
						object.geometry.dispose();
						// material 可能是数组也可能是单个，统一处理。
						const materials = Array.isArray(object.material)
							? object.material
							: [object.material];
						for (const item of materials) item.dispose();
					}
				});
				// 3. 释放 renderer 的 GL 资源并从 DOM 卸载 canvas。
				renderer?.dispose();
				renderer?.domElement.remove();
			});
		});

		// 卸载时统一调用所有 cleanups（键盘监听、ResizeObserver、动画循环、GL 资源等）。
		return () => {
			disposed = true;
			for (const cleanup of cleanups) cleanup();
		};
	}, []); // 空依赖：仅挂载/卸载跑一次

	// ====== React UI ======
	return (
		<div className="flex h-full w-full flex-col overflow-hidden">
			{/* 3D 画布容器；relative 让左上角分数卡可以绝对定位。 */}
			<div
				ref={mountRef}
				className="relative min-h-0 w-full flex-1 overflow-hidden rounded-xl"
			>
				{/* 分数浮窗：pointer-events-none 避免挡住点击飞船（虽然这里是 3D，无点击交互但保留习惯）。 */}
				<div className="pointer-events-none absolute top-4 left-4 z-10 rounded-lg border border-violet-200/15 bg-black/40 px-3 py-1.5 backdrop-blur sm:top-6 sm:left-6">
					<p className="text-[10px] text-violet-200/45 uppercase tracking-[0.2em]">
						Drift score
					</p>
					{/* tabular-nums 让数字等宽，统计跳变时不抖动。 */}
					<p className="font-black text-violet-100 text-xl tabular-nums sm:text-2xl">
						{String(score).padStart(5, "0")}
					</p>
				</div>
			</div>
		</div>
	);
}
