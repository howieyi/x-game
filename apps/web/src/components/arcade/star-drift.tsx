import { useEffect, useRef, useState } from "react";

import { useArcadeFinish } from "@/hooks/use-arcade-finish";

// The ship sits at a fixed point in world space; the camera is parented to
// it so the action stays centred no matter how small or oddly proportioned
// the viewport is. All other world geometry (track grid, obstacles) is
// positioned relative to `SHIP` so they always appear in frame.
const SHIP = { x: 0, y: 0.65, z: 3 } as const;

export function StarDrift() {
	const mountRef = useRef<HTMLDivElement>(null);
	const [score, setScore] = useState(0);

	const onFinish = useArcadeFinish("arena-3d");
	const onFinishRef = useRef(onFinish);
	useEffect(() => {
		onFinishRef.current = onFinish;
	}, [onFinish]);

	useEffect(() => {
		const host = mountRef.current;
		if (!host) return;
		let disposed = false;
		let renderer: import("three").WebGLRenderer | undefined;
		const cleanups: Array<() => void> = [];

		void import("three").then((THREE) => {
			if (disposed || !host) return;
			const scene = new THREE.Scene();
			scene.background = new THREE.Color(0x05060b);
			scene.fog = new THREE.FogExp2(0x070817, 0.025);

			// Camera — aspect is filled in by `resize()` once we know the host
			// size. The initial `16 / 9` is only a fallback that gets replaced
			// before the first paint.
			const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 200);
			camera.position.set(0, 4, SHIP.z + 8);
			camera.lookAt(SHIP.x, SHIP.y, SHIP.z);

			renderer = new THREE.WebGLRenderer({ antialias: true });
			renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
			renderer.shadowMap.enabled = true;
			host.appendChild(renderer.domElement);

			scene.add(new THREE.HemisphereLight(0x8b5cf6, 0x05060b, 2.2));
			const keyLight = new THREE.DirectionalLight(0x67e8f9, 5);
			keyLight.position.set(4, 8, 5);
			scene.add(keyLight);

			// Track grid centred on the ship in the XZ plane.
			const track = new THREE.GridHelper(40, 40, 0x7c3aed, 0x1e3a8a);
			track.position.set(SHIP.x, 0, SHIP.z - 11);
			scene.add(track);

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
			ship.rotation.x = Math.PI / 2;
			ship.position.set(SHIP.x, SHIP.y, SHIP.z);
			scene.add(ship);

			// Obstacles spawn ahead of the ship and recycle once they pass.
			const obstacles: import("three").Mesh[] = [];
			const geometry = new THREE.BoxGeometry(1.3, 1.3, 1.3);
			const material = new THREE.MeshStandardMaterial({
				color: 0xec4899,
				emissive: 0x9d174d,
				emissiveIntensity: 1.5,
			});
			for (let i = 0; i < 12; i++) {
				const block = new THREE.Mesh(geometry, material);
				block.position.set(((i * 3.7) % 10) - 5, SHIP.y, SHIP.z - 5 - i * 5);
				block.rotation.set(i, i * 0.4, 0);
				scene.add(block);
				obstacles.push(block);
			}

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

			const clock = new THREE.Clock();
			let points = 0;
			let elapsed = 0;
			let ended = false;
			let obstaclesRecycled = 0;
			let hits = 0;
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

			// Resize keeps the ship centred regardless of how the host
			// element is sized. `host.clientWidth` can be 0 on first mount
			// (the browser hasn't laid the element out yet) — the `Math.max`
			// clamp below gives us a sane aspect ratio for that brief window.
			const MIN_WIDTH = 320;
			const MIN_HEIGHT = 240;
			const resize = () => {
				const width = Math.max(MIN_WIDTH, host.clientWidth);
				const height = Math.max(MIN_HEIGHT, host.clientHeight);
				renderer?.setSize(width, height, false);
				camera.aspect = width / height;
				camera.updateProjectionMatrix();
			};
			resize(); // run synchronously so the first frame is correct.
			const observer = new ResizeObserver(resize);
			observer.observe(host);
			cleanups.push(() => observer.disconnect());

			renderer.setAnimationLoop(() => {
				if (ended) return;
				const delta = Math.min(clock.getDelta(), 0.05);
				elapsed += delta;
				const direction =
					keys.has("a") || keys.has("arrowleft")
						? -1
						: keys.has("d") || keys.has("arrowright")
							? 1
							: 0;
				ship.position.x = THREE.MathUtils.clamp(
					ship.position.x + direction * delta * 7,
					-5.2,
					5.2,
				);
				ship.rotation.z = THREE.MathUtils.lerp(
					ship.rotation.z,
					-direction * 0.5,
					0.12,
				);
				for (const block of obstacles) {
					block.position.z += delta * 10;
					block.rotation.x += delta;
					block.rotation.y += delta * 1.3;
					if (block.position.z > SHIP.z + 4) {
						block.position.z -= 60;
						block.position.x = Math.random() * 10 - 5;
						points += 25;
						obstaclesRecycled += 1;
						setScore(points);
					}
					if (
						Math.abs(block.position.z - ship.position.z) < 1.1 &&
						Math.abs(block.position.x - ship.position.x) < 1
					) {
						block.position.z -= 40;
						points = Math.max(0, points - 100);
						hits += 1;
						setScore(points);
						endRun();
						return;
					}
				}
				if (ended) return;
				track.position.z = ((track.position.z + delta * 10 + 10) % 2) - 10;
				renderer?.render(scene, camera);
			});

			cleanups.push(() => {
				renderer?.setAnimationLoop(null);
				scene.traverse((object) => {
					if (object instanceof THREE.Mesh) {
						object.geometry.dispose();
						const materials = Array.isArray(object.material)
							? object.material
							: [object.material];
						for (const item of materials) item.dispose();
					}
				});
				renderer?.dispose();
				renderer?.domElement.remove();
			});
		});

		return () => {
			disposed = true;
			for (const cleanup of cleanups) cleanup();
		};
	}, []);

	return (
		<div className="flex h-full w-full flex-col overflow-hidden">
			<div
				ref={mountRef}
				className="relative min-h-0 w-full flex-1 overflow-hidden rounded-xl"
			>
				<div className="pointer-events-none absolute top-4 left-4 z-10 rounded-lg border border-violet-200/15 bg-black/40 px-3 py-1.5 backdrop-blur sm:top-6 sm:left-6">
					<p className="text-[10px] text-violet-200/45 uppercase tracking-[0.2em]">
						Drift score
					</p>
					<p className="font-black text-violet-100 text-xl tabular-nums sm:text-2xl">
						{String(score).padStart(5, "0")}
					</p>
				</div>
			</div>
		</div>
	);
}
