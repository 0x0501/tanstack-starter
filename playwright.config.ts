import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 4173);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

/**
 * UI e2e — theme, contrast, mobile + 4K layout.
 * Starts a Vite preview of the production build when no E2E_BASE_URL is set.
 */
export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: [["list"]],
	timeout: 60_000,
	expect: { timeout: 10_000 },
	use: {
		baseURL: BASE_URL,
		trace: "on-first-retry",
		screenshot: "only-on-failure",
	},
	projects: [
		{
			name: "mobile",
			use: {
				// Chromium with a phone viewport — avoid WebKit binary requirement.
				browserName: "chromium",
				...devices["Pixel 7"],
				viewport: { width: 390, height: 844 },
			},
		},
		{
			name: "desktop",
			use: {
				browserName: "chromium",
				viewport: { width: 1440, height: 900 },
			},
		},
		{
			name: "4k",
			use: {
				browserName: "chromium",
				viewport: { width: 3840, height: 2160 },
				deviceScaleFactor: 1,
			},
		},
	],
	webServer: process.env.E2E_BASE_URL
		? undefined
		: {
				command: `bun run build && bunx vite preview --host 127.0.0.1 --port ${PORT}`,
				url: BASE_URL,
				reuseExistingServer: !process.env.CI,
				timeout: 300_000,
			},
});
