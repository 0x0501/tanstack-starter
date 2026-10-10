import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
	chmod,
	mkdtemp,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "vitest";
import {
	catalog,
	choices,
	incompatibilities,
	isPostgres,
	validateSelection,
} from "../../packages/mystack/src/catalog.mjs";
import { installDependencies } from "../../packages/mystack/src/cli.mjs";
import {
	createProject,
	renderProject,
} from "../../packages/mystack/src/generate.mjs";

const templateRoot = fileURLToPath(new URL("../../", import.meta.url));
const base = {
	database: "pg-hyperdrive",
	deployment: "cloudflare",
	email: "cloudflare",
	payments: ["stripe"],
};

test("CLI rejects invalid flags and non-terminal input with actionable feedback before writing", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "mystack-cli-feedback-"));
	const cli = fileURLToPath(
		new URL("../../packages/mystack/src/cli.mjs", import.meta.url),
	);
	try {
		for (const [args, message] of [
			[
				["--yes", "--database", "d1", "--deployment", "bun"],
				/D1 requires Cloudflare Workers/,
			],
			[[], /Use --yes/],
			[["--yes", "--payments", "stripe,stripe"], /Duplicate payment providers/],
		] as const) {
			await assert.rejects(
				promisify(execFile)(
					process.execPath,
					[cli, "create", "test-app", ...args],
					{ cwd },
				),
				(error: Error & { code?: number; stdout?: string }) => {
					assert.equal(error.code, 1);
					assert.match(error.stdout ?? "", message);
					return true;
				},
			);
			assert.deepEqual(await readdir(cwd), []);
		}
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
});

test("dependency installation runs in the project and retains useful failure output", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "mystack-installer-"));
	const originalPath = process.env.PATH;
	const executable = join(cwd, "bun");
	try {
		process.env.PATH = `${cwd}${delimiter}${originalPath}`;
		await writeFile(
			executable,
			'#!/usr/bin/env node\nrequire("node:fs").writeFileSync("installed", "ok");\nconsole.log("installation output");\n',
		);
		await chmod(executable, 0o755);
		await installDependencies(cwd);
		assert.equal(await readFile(join(cwd, "installed"), "utf8"), "ok");
		await writeFile(
			executable,
			'#!/usr/bin/env node\nconsole.error("registry unavailable");\nprocess.exit(42);\n',
		);
		await assert.rejects(
			installDependencies(cwd),
			/exited with 42\nregistry unavailable/,
		);
		assert.equal(await readFile(join(cwd, "installed"), "utf8"), "ok");
		await rm(executable);
		process.env.PATH = cwd;
		await assert.rejects(installDependencies(cwd), /ENOENT/);
	} finally {
		if (originalPath === undefined) delete process.env.PATH;
		else process.env.PATH = originalPath;
		await rm(cwd, { recursive: true, force: true });
	}
});

test("D1 disables Nitro and Bun, and flags cannot bypass the same rule", () => {
	const options: Array<{ value: string; disabled?: string }> = choices(
		"deployment",
		{ database: "d1" },
	);
	assert.equal(
		options.find((option) => option.value === "cloudflare")?.disabled,
		undefined,
	);
	for (const deployment of ["nitro", "bun"]) {
		assert.match(
			options.find((option) => option.value === deployment)?.disabled ?? "",
			/D1/,
		);
		assert.throws(
			() => validateSelection({ ...base, database: "d1", deployment }),
			/D1/,
		);
	}
	assert.throws(
		() => validateSelection({ ...base, database: "pg", deployment: "bun" }),
		/Cloudflare Email/,
	);
	assert.throws(
		() => validateSelection({ ...base, payments: ["stripe", "stripe"] }),
		/Duplicate/,
	);
	assert.throws(
		() => validateSelection({ ...base, database: "unknown" }),
		/Unknown/,
	);
});

test("all supported combinations emit the selected drivers, transport, payment routes and scripts", async () => {
	let combinations = 0;
	for (const { id: database } of catalog.database)
		for (const deployment of ["cloudflare", "nitro", "bun"])
			for (const email of ["cloudflare", "resend"]) {
				for (const payments of Array.from({ length: 16 }, (_, mask) =>
					["stripe", "creem", "nowpayments", "polar"].filter(
						(_, index) => mask & (1 << index),
					),
				)) {
					const selection = { database, deployment, email, payments };
					if (incompatibilities(selection).length) continue;
					combinations++;
					const files = await renderProject({
						name: "test-app",
						selection,
						templateRoot,
					});
					const pkg = JSON.parse(files.get("package.json").toString());
					assert.equal(pkg.name, "test-app");
					assert.doesNotMatch(
						files.get("src/lib/auth.ts").toString(),
						/createAuth\(\{\}/,
					);
					assert.match(
						files.get("src/lib/auth-client.ts").toString(),
						/inferAdditionalFields<Auth>/,
					);
					assert.equal(
						files.has("wrangler.jsonc"),
						deployment === "cloudflare",
					);
					assert.equal(files.has("serve.ts"), deployment === "bun");
					assert.equal(Boolean(pkg.dependencies.pg), isPostgres(database));
					assert.equal(
						Boolean(pkg.dependencies["@libsql/client"]),
						database === "turso-cloud" || database === "turso-local",
					);
					for (const provider of ["stripe", "creem", "nowpayments", "polar"])
						assert.equal(
							files.has(`src/routes/api/webhooks/${provider}.ts`),
							payments.includes(provider),
						);
					if (deployment === "cloudflare") {
						const bindings = files.get("worker-configuration.d.ts").toString();
						assert.equal(
							bindings.includes("\tHYPERDRIVE: Hyperdrive;"),
							database === "pg-hyperdrive",
						);
						assert.equal(
							bindings.includes("\tDB: D1Database;"),
							database === "d1",
						);
						assert.equal(
							bindings.includes("\tEMAIL: SendEmail;"),
							email === "cloudflare",
						);
					}
					if (deployment !== "cloudflare") {
						for (const [path, contents] of files)
							if (path.startsWith("src/") && !path.includes("__tests__"))
								assert.doesNotMatch(
									contents.toString(),
									/(?:from |import\()["']cloudflare:workers/,
									path,
								);
					}
					if (database === "d1") {
						assert.match(
							files.get("wrangler.jsonc").toString(),
							/d1_databases/,
						);
						assert.doesNotMatch(
							files.get("src/services/purchase.ts").toString(),
							/\.transaction\(/,
						);
						assert.match(
							files.get("src/services/purchase.ts").toString(),
							/db.batch/,
						);
					}
					if (database === "turso-cloud") {
						assert.match(
							files.get(".env.example").toString(),
							/TURSO_DATABASE_URL=libsql:\/\//,
						);
						assert.doesNotMatch(
							files.get(".env.example").toString(),
							/file:local.db/,
						);
						assert.match(
							files.get("src/env.ts").toString(),
							/TURSO_AUTH_TOKEN: z.string\(\).min\(1\)/,
						);
					}
					if (database === "turso-local") {
						assert.match(
							files.get(".env.example").toString(),
							/TURSO_DATABASE_URL=file:local.db/,
						);
						assert.doesNotMatch(
							files.get("src/env.ts").toString(),
							/TURSO_AUTH_TOKEN/,
						);
					}
					if (database === "bun-sqlite") {
						assert.match(
							files.get("src/db/index.ts").toString(),
							/from "bun:sqlite"/,
						);
						assert.match(
							files.get("src/services/purchase.ts").toString(),
							/db.transaction/,
						);
						assert.doesNotMatch(
							files.get("src/services/admin-security.ts").toString(),
							/db.batch|transaction\(async/,
						);
						assert.equal(
							pkg.scripts["db:migrate"],
							"bun scripts/migrate-bun-sqlite.ts",
						);
					}

					assert.ok(
						files.has("drizzle/0000_thin_phalanx.sql") || isPostgres(database),
					);
				}
			}
	assert.equal(combinations, 208);
});

test("generation is self-contained and refuses existing directories", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "mystack-test-"));
	try {
		await writeFile(join(cwd, ".env"), "SECRET=never-copy");
		const target = await createProject({
			name: "fresh-app",
			selection: base,
			cwd,
			templateRoot,
		});
		assert.equal(
			JSON.parse((await readFile(join(target, "mystack.json"))).toString())
				.database,
			"pg-hyperdrive",
		);
		assert.ok(!(await readdir(target)).includes(".env"));
		assert.doesNotMatch(
			await readFile(join(target, "src/routeTree.gen.ts"), "utf8"),
			/webhooks\/(creem|nowpayments|polar)/,
		);
		await writeFile(join(target, "keep.txt"), "original");
		await assert.rejects(
			createProject({ name: "fresh-app", selection: base, cwd, templateRoot }),
			/EEXIST/,
		);
		assert.equal(await readFile(join(target, "keep.txt"), "utf8"), "original");
		await assert.rejects(
			createProject({ name: "../escape", selection: base, cwd, templateRoot }),
			/Project name/,
		);
		await assert.rejects(
			createProject({
				name: "broken-app",
				selection: base,
				cwd,
				templateRoot: cwd,
			}),
			/missing/,
		);
		assert.ok(!(await readdir(cwd)).includes("broken-app"));
		assert.ok(
			!(await readdir(cwd)).some((name) => name.startsWith(".mystack-")),
		);
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
});

test("database choices distinguish connections and disable unavailable runtimes", () => {
	assert.deepEqual(
		catalog.database.map((option) => option.id),
		["pg", "pg-hyperdrive", "d1", "turso-cloud", "turso-local", "bun-sqlite"],
	);
	for (const [database, deployments] of [
		["pg", ["nitro", "bun"]],
		["pg-hyperdrive", ["cloudflare"]],
		["d1", ["cloudflare"]],
		["turso-cloud", ["cloudflare", "nitro", "bun"]],
		["turso-local", ["nitro", "bun"]],
		["bun-sqlite", ["bun"]],
	] as const) {
		const options = choices("deployment", { database });
		for (const option of options)
			assert.equal(
				Boolean(option.disabled),
				!deployments.some((id) => id === option.value),
			);
	}
	assert.throws(
		() => validateSelection({ ...base, database: "turso" }),
		/Unknown database/,
	);
});
