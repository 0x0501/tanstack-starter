import { spawn } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
const temporary = "src/lib/.mystack-auth.ts";
let source = (await readFile("src/lib/auth.ts", "utf8"))
	.replace('import { waitUntil } from "cloudflare:workers";', 'const waitUntil = (promise: Promise<unknown>) => { void promise; };')
	.replaceAll("import.meta.env", '({ DEV: true, VITE_GITHUB_CLIENT_ID: undefined })');
// The offline generator reads plugin metadata without a connected database.
// Runtime auth keeps schema validation enabled.
source = source.includes("\t\tadvanced: {\n")
	? source.replace("\t\tadvanced: {\n", "\t\tadvanced: {\n\t\t\tdatabase: { validateSchema: false },\n")
	: source.replace("\t\ttelemetry: { enabled: false },", "\t\ttelemetry: { enabled: false },\n\t\tadvanced: { database: { validateSchema: false } },");
source += "\nexport const auth = createAuth({} as unknown as Database);\n";
await writeFile(temporary, source, { flag: "wx" });
try {
	await new Promise((resolve, reject) => {
		const child = spawn("bun", ["x", "auth@1.7.3", "generate", "--config", temporary, "--output", "./src/db/auth.schema.ts", "--yes"], { stdio: "inherit" });
		child.on("error", reject);
		child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Auth schema generation failed (${code})`)));
	});
	await new Promise((resolve, reject) => {
		const child = spawn("bun", ["x", "biome", "check", "--write", "src/db/auth.schema.ts"], { stdio: "inherit" });
		child.on("error", reject);
		child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Auth schema formatting failed (${code})`)));
	});
} finally { await rm(temporary, { force: true }); }
