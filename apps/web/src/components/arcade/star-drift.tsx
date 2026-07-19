import { useEffect, useRef, useState } from "react";

export function StarDrift() {
	const mountRef = useRef<HTMLDivElement>(null);
	const [score, setScore] = useState(0);

	useEffect(() => {
		const host = mountRef.current;
		if (!host) return;
		let disposed = false;
		let renderer: import("three").WebGLRenderer | undefined;
		const cleanups: Array<() => void> = [];

		void import("three").then((THREE) => {
			if (disposed) return;
			const scene = new THREE.Scene();
			scene.background = new THREE.Color(0x05060b);
			scene.fog = new THREE.FogExp2(0x070817, 0.025);
			const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 200);
			camera.position.set(0, 8, 13);
			camera.lookAt(0, 0, -8);
			renderer = new THREE.WebGLRenderer({ antialias: true });
			renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
			renderer.shadowMap.enabled = true;
			host.appendChild(renderer.domElement);

			scene.add(new THREE.HemisphereLight(0x8b5cf6, 0x05060b, 2.2));
			const keyLight = new THREE.DirectionalLight(0x67e8f9, 5);
			keyLight.position.set(4, 8, 5);
			scene.add(keyLight);

			const track = new THREE.GridHelper(40, 40, 0x7c3aed, 0x1e3a8a);
			track.position.z = -8;
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
			ship.position.set(0, 0.65, 3);
			scene.add(ship);

			const obstacles: import("three").Mesh[] = [];
			const geometry = new THREE.BoxGeometry(1.3, 1.3, 1.3);
			const material = new THREE.MeshStandardMaterial({
				color: 0xec4899,
				emissive: 0x9d174d,
				emissiveIntensity: 1.5,
			});
			for (let i = 0; i < 12; i++) {
				const block = new THREE.Mesh(geometry, material);
				block.position.set(((i * 3.7) % 10) - 5, 0.65, -i * 5 - 5);
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
			const resize = () => {
				const width = host.clientWidth;
				const height = Math.max(320, width * 0.5625);
				renderer?.setSize(width, height, false);
				camera.aspect = width / height;
				camera.updateProjectionMatrix();
			};
			const observer = new ResizeObserver(resize);
			observer.observe(host);
			cleanups.push(() => observer.disconnect());
			resize();

			renderer.setAnimationLoop(() => {
				const delta = Math.min(clock.getDelta(), 0.05);
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
					if (block.position.z > 7) {
						block.position.z -= 60;
						block.position.x = Math.random() * 10 - 5;
						points += 25;
						setScore(points);
					}
					if (
						Math.abs(block.position.z - ship.position.z) < 1.1 &&
						Math.abs(block.position.x - ship.position.x) < 1
					) {
						block.position.z -= 40;
						points = Math.max(0, points - 100);
						setScore(points);
					}
				}
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
		<div className="relative overflow-hidden rounded-3xl border border-violet-300/15 bg-violet-300/[0.03] p-2 shadow-[0_0_80px_rgba(139,92,246,0.12)]">
			<div
				ref={mountRef}
				className="aspect-video w-full overflow-hidden rounded-2xl"
			/>
			<div className="pointer-events-none absolute top-6 left-6 rounded-lg border border-violet-200/15 bg-black/40 px-4 py-2 backdrop-blur">
				<p className="text-[10px] text-violet-200/45 uppercase tracking-[0.2em]">
					Drift score
				</p>
				<p className="font-black text-2xl text-violet-100 tabular-nums">
					{String(score).padStart(5, "0")}
				</p>
			</div>
		</div>
	);
}
