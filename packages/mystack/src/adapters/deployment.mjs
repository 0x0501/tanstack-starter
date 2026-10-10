import { replace, text } from "../template.mjs";

export async function configureDeployment({ files, pkg, selection, name }) {
	if (selection.deployment === "cloudflare") {
		replace(
			files,
			"wrangler.jsonc",
			'"name": "tanstack-starter"',
			`"name": "${name}"`,
		);
		pkg.scripts["cf:typegen"] = "wrangler types";
		return;
	}
	files.delete("wrangler.jsonc");
	files.delete("worker-configuration.d.ts");
	delete pkg.dependencies["@cloudflare/vite-plugin"];
	delete pkg.devDependencies.wrangler;
	replace(
		files,
		"src/lib/auth.ts",
		'import { waitUntil } from "cloudflare:workers";\n',
		"",
	);
	// Server runtimes keep promises alive without Workers waitUntil.
	replace(
		files,
		"src/lib/auth.ts",
		"\t\tadvanced: {\n\t\t\tbackgroundTasks: {\n\t\t\t\thandler: (promise) => {\n\t\t\t\t\twaitUntil(promise);\n\t\t\t\t},\n\t\t\t},\n\t\t},\n",
		"",
	);
	files.set(
		"src/middlewares/auth-rate-limit.ts",
		`import { createMiddleware } from "@tanstack/react-start";
// Better Auth's built-in per-process limiter handles server deployments.
export const authRateLimitMiddleware = createMiddleware().server(({ next }) => next());
`,
	);
	replace(
		files,
		"src/lib/auth.ts",
		"\t\ttelemetry: { enabled: false },",
		'\t\ttelemetry: { enabled: false },\n\t\trateLimit: { enabled: true, storage: "memory" },',
	);
	let vite = text(files, "vite.config.ts")
		.replace('import { cloudflare } from "@cloudflare/vite-plugin";\n', "")
		.replace('\t\tcloudflare({ viteEnvironment: { name: "ssr" } }),\n', "");
	if (selection.deployment === "nitro") {
		pkg.devDependencies.nitro = "3.0.260903-beta";
		vite = `import { nitro } from "nitro/vite";\n${vite}`.replace(
			"\t\ttanstackStart(),",
			'\t\ttanstackStart(),\n\t\tnitro({ preset: "node-server" }),',
		);
		pkg.scripts.start = "node .output/server/index.mjs";
		pkg.scripts.preview = "node .output/server/index.mjs";
		pkg.scripts.deploy =
			"bun run validate-prod-env && bun run build && bun run check:client-bundle";
		replace(
			files,
			"scripts/check-client-bundle.ts",
			'join(ROOT, "dist", "client")',
			'join(ROOT, ".output", "public")',
		);
	} else {
		pkg.devDependencies["@types/bun"] = "^1.3.0";
		files.set("serve.ts", bunServer);
		pkg.scripts.start = "bun run serve.ts";
		pkg.scripts.preview = "bun run serve.ts";
		pkg.scripts.deploy =
			"bun run validate-prod-env && bun run build && bun run check:client-bundle";
	}
	files.set("vite.config.ts", vite);
}

const bunServer = `import { resolve, sep } from "node:path";
const entry = "./dist/server/server.js";
const { default: handler } = await import(entry);

const publicDirectory = resolve("dist/client");
Bun.serve({
	port: Number(process.env.PORT ?? 3000),
	hostname: process.env.HOST ?? "0.0.0.0",
	async fetch(request) {
		const url = new URL(request.url);
		let pathname: string;
		try { pathname = decodeURIComponent(url.pathname); }
		catch { return new Response("Bad request", { status: 400 }); }
		if (request.method === "GET" || request.method === "HEAD") {
			const path = resolve(publicDirectory, "." + pathname);
			if (path.startsWith(publicDirectory + sep)) {
				const file = Bun.file(path);
				if (await file.exists()) {
					const headers = new Headers({ "Content-Type": file.type });
					if (pathname.startsWith("/assets/")) headers.set("Cache-Control", "public, max-age=31536000, immutable");
					return new Response(request.method === "HEAD" ? null : file, { headers });
				}
			}
		}
		return handler.fetch(request);
	},
});
`;
