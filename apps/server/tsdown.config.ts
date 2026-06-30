import { defineConfig } from "tsdown";

// Two bundles, both emitted to ./dist:
//   - index.mjs  : standalone Node server (externalizes node_modules deps)
//   - lambda.mjs : AWS Lambda handler with ALL deps bundled (single-file
//                  artifact, ready to ship to Lambda without node_modules)
export default defineConfig([
	{
		entry: { index: "./src/index.ts" },
		format: "esm",
		outDir: "./dist",
		noExternal: [/@x-game\/.*/],
	},
	{
		entry: { lambda: "./src/lambda.ts" },
		format: "esm",
		outDir: "./dist",
		// Bundle every dependency so the Lambda deployment is a single .mjs
		// file. This avoids packaging pnpm workspace symlinks and keeps
		// cold-start extraction minimal.
		noExternal: [/.+/],
	},
]);