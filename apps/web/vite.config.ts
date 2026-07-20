import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	// 项目的本地环境变量统一维护在 monorepo 根目录；Vite 默认只会读取
	// apps/web/.env，不显式设置时浏览器端会缺少 VITE_SERVER_URL。
	envDir: "../..",
	server: {
		// Web 固定使用 5173，与根目录 .env 的 CORS_ORIGIN 保持一致。
		// MCP 服务独占 3001；端口被占用时直接报错，避免 Vite 自动漂移后
		// 浏览器访问到错误服务，或因来源地址变化触发 CORS 异常。
		host: "127.0.0.1",
		port: 5173,
		strictPort: true,
	},
	resolve: {
		tsconfigPaths: true,
	},
	plugins: [
		tailwindcss(),
		tanstackRouter({
			target: "react",
			autoCodeSplitting: true,
		}),
		react(),
	],
});
