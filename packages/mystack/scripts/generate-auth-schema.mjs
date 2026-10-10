import { readFile, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const temporary = `${root}/src/lib/.mystack-auth.ts`;
const source = (await readFile(`${root}/src/lib/auth.ts`, "utf8"))
	.replace('import { waitUntil } from "cloudflare:workers";', 'const waitUntil = (promise: Promise<unknown>) => { void promise; };')
	.replace('provider: "pg"', 'provider: "sqlite"')
	.replaceAll("import.meta.env", '({ DEV: true, VITE_GITHUB_CLIENT_ID: undefined })');
await writeFile(temporary, source, { flag: "wx" });
try {
	await new Promise((resolve, reject) => {
		const child = spawn("bun", ["x", "auth@1.7.3", "generate", "--config", temporary, "--output", "./packages/mystack/assets/auth.sqlite.schema.ts", "--yes"], {
			cwd: root, stdio: "inherit", env: { ...process.env, APP_ORIGIN: "http://localhost:3000", BETTER_AUTH_URL: "http://localhost:3000", BETTER_AUTH_SECRET: "schema-generation-only-secret-00000000", EMAIL_FROM: "auth@example.com", EMAIL_FROM_NAME: "Starter" },
		});
		child.on("error", reject);
		child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Auth schema generation failed (${code})`)));
	});
} finally { await rm(temporary, { force: true }); }
