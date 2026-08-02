import { fileURLToPath } from "node:url";
import babel from "@rolldown/plugin-babel";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Tests run in Node, not the Worker runtime. Resolve the `@/*` tsconfig alias
// explicitly — Vite 8's native `resolve.tsconfigPaths` is intermittent here.
export default defineConfig({
	plugins: [viteReact(), babel({ presets: [reactCompilerPreset()] })],
	resolve: {
		alias: [
			{
				find: /^@\//,
				replacement: fileURLToPath(new URL("./src/", import.meta.url)),
			},
		],
	},
	test: {
		environment: "node",
		include: ["src/__tests__/**/*.test.ts", "src/__tests__/**/*.test.tsx"],
		globalSetup: ["./src/__tests__/global-setup.ts"],
		// Shared Postgres container from global-setup; keep headroom for cold starts.
		testTimeout: 30_000,
		hookTimeout: 120_000,
	},
});
