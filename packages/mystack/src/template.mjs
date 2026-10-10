import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

// An allowlist prevents credentials, Git history, installed dependencies and
// local build output from entering the published template.
export const templateEntries = [
	"src",
	"public",
	"scripts",
	"drizzle",
	"project.inlang/settings.json",
	"messages",
	"e2e",
	"package.json",
	"vite.config.ts",
	"tsconfig.json",
	"tsr.config.json",
	"biome.json",
	"vitest.config.ts",
	"playwright.config.ts",
	"drizzle.config.ts",
	"paraglide.config.ts",
	"wrangler.jsonc",
	"worker-configuration.d.ts",
	"docker-compose.yml",
	".env.example",
	".env.docker",
	".gitignore",
	"DESIGN.md",
	"LICENSE",
];

export async function readTemplate(root, { packaged = false } = {}) {
	const files = new Map();
	async function visit(path) {
		if (
			path === "src/paraglide" ||
			path.startsWith("scripts/mystack") ||
			path === "src/__tests__/mystack.test.ts"
		)
			return;
		const absolute = join(
			root,
			packaged && path === ".gitignore" ? "gitignore" : path,
		);
		const { lstat } = await import("node:fs/promises");
		let entry;
		try {
			entry = await lstat(absolute);
		} catch (error) {
			if (error.code === "ENOENT" && templateEntries.includes(path)) return;
			throw error;
		}
		if (entry.isSymbolicLink())
			throw new Error(`Template symlinks are forbidden: ${path}`);
		if (entry.isDirectory()) {
			for (const name of (await readdir(absolute)).sort())
				await visit(`${path}/${name}`);
		} else if (entry.isFile()) files.set(path, await readFile(absolute));
	}
	for (const path of templateEntries) await visit(path);
	for (const path of [
		"package.json",
		"src/lib/auth.ts",
		"src/db/auth.schema.ts",
		".gitignore",
		".env.example",
		"messages/en.json",
		"messages/de.json",
	]) {
		if (!files.has(path))
			throw new Error(
				`Template is missing ${path}. Run template:prepare before packaging.`,
			);
	}
	return files;
}

export function text(files, path) {
	if (!files.has(path)) throw new Error(`Template is missing ${path}.`);
	return files.get(path).toString("utf8");
}

export function replace(files, path, before, after) {
	const source = text(files, path);
	if (!source.includes(before))
		throw new Error(
			`Template changed: expected anchor in ${path}: ${before.slice(0, 80)}`,
		);
	files.set(path, source.replace(before, after));
}
