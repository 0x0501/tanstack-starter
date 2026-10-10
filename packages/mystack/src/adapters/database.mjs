import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { isPostgres } from "../catalog.mjs";
import { replace, text } from "../template.mjs";

export async function configureDatabase(context) {
	const { files, selection, pkg } = context;
	// Schema generation must not instantiate an empty auth adapter at app startup.
	replace(
		files,
		"src/lib/auth.ts",
		"// For better-auth schema generation only.\nexport const auth = createAuth({} as unknown as Database);",
		"export type Auth = ReturnType<typeof createAuth>;",
	);
	replace(
		files,
		"src/lib/auth-client.ts",
		"import type { auth }",
		"import type { Auth }",
	);
	replace(
		files,
		"src/lib/auth-client.ts",
		"inferAdditionalFields<typeof auth>()",
		"inferAdditionalFields<Auth>()",
	);
	files.set(
		"scripts/generate-auth-schema.mjs",
		await readFile(
			new URL("../../assets/generate-auth-schema.mjs", import.meta.url),
		),
	);
	pkg.scripts["auth:generate"] =
		"bun run paraglide:compile && bun scripts/generate-auth-schema.mjs";
	if (isPostgres(selection.database)) {
		if (selection.database === "pg") {
			files.set(
				"src/db/index.ts",
				`import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
export function createDB(connectionString: string) {
	return drizzle(new Pool({ connectionString }), { schema });
}
export type Database = ReturnType<typeof createDB>;
export type DatabaseTxCallback = Parameters<Database["transaction"]>[0];
export type DatabaseTx = Parameters<DatabaseTxCallback>[0];
`,
			);
			files.set(
				"src/middlewares/database.ts",
				`import { createMiddleware } from "@tanstack/react-start";
import { createDB } from "@/db";
import { env } from "@/env";
let database: ReturnType<typeof createDB> | undefined;
export const databaseMiddleware = createMiddleware().server(({ next }) => {
	database ??= createDB(env.DATABASE_URL);
	return next({ context: { db: database } });
});
`,
			);
			replace(
				files,
				"src/env.ts",
				"\t\t\tAPP_ORIGIN: z.url(),",
				"\t\t\tDATABASE_URL: z.string().min(1),\n\t\t\tAPP_ORIGIN: z.url(),",
			);
			files.set(
				".env.example",
				`${text(files, ".env.example")}\n# Runtime app role; never use DATABASE_MIGRATION_URL here.\nDATABASE_URL=postgresql://starter_app:starter_app_dev_password@localhost:5432/starter\n`,
			);
		}
		return;
	}
	files.set(
		"src/services/purchase.ts",
		await readFile(
			new URL(
				selection.database === "bun-sqlite"
					? "../../assets/purchase.bun-sqlite.ts"
					: "../../assets/purchase.sqlite.ts",
				import.meta.url,
			),
		),
	);
	delete pkg.scripts["db:push"];
	delete pkg.scripts["db:studio"];
	delete pkg.dependencies.pg;
	delete pkg.devDependencies["@types/pg"];
	delete pkg.devDependencies["@testcontainers/postgresql"];
	for (const path of files.keys()) {
		if (
			path.startsWith("drizzle/") ||
			path.startsWith("scripts/postgres/") ||
			path === ".env.docker" ||
			path.includes("compose")
		)
			files.delete(path);
	}
	for (const command of [
		"db:up",
		"db:down",
		"db:reset",
		"db:seed",
		"seed:local",
		"db:pull",
	])
		delete pkg.scripts[command];
	files.delete("scripts/seed-local.ts");
	files.set(
		"src/db/auth.schema.ts",
		await readFile(
			new URL("../../assets/auth.sqlite.schema.ts", import.meta.url),
		),
	);
	files.set(
		"src/db/platform.schema.ts",
		(
			await readFile(
				new URL("../../assets/platform.sqlite.schema.ts", import.meta.url),
				"utf8",
			)
		).replace("./auth.sqlite.schema", "./auth.schema"),
	);
	replace(
		files,
		"src/lib/auth.ts",
		'provider: "pg"',
		'provider: "sqlite",\n\t\t\ttransaction: false',
	);
	// SQLite has no PG session GUCs. All user queries carry explicit ownership
	// predicates; admin writes are guarded by admin middleware.
	files.set(
		"src/db/helper.ts",
		`import type { Database } from ".";
export async function withDatabaseUser<T>(db: Database, _userId: string, fn: (db: Database) => T | Promise<T>): Promise<T> { return fn(db); }
export async function withDatabaseService<T>(db: Database, fn: (db: Database) => T | Promise<T>): Promise<T> { return fn(db); }
`,
	);
	for (const [path, contents] of files) {
		if (!path.endsWith(".ts") && !path.endsWith(".tsx")) continue;
		files.set(
			path,
			contents
				.toString()
				.replaceAll("withRlsUser", "withDatabaseUser")
				.replaceAll("withRlsService", "withDatabaseService"),
		);
	}
	replace(files, "src/services/admin-users.ts", "ilike", "like");
	replace(
		files,
		"src/services/admin-users.ts",
		"ilike(user.email, q), ilike(user.name, q)",
		"like(user.email, q), like(user.name, q)",
	);
	// Database integration tests need a dialect-specific harness, not the PG one.
	for (const [path, content] of files) {
		if (!path.startsWith("src/__tests__/")) continue;
		if (
			/\/(global-setup|test-db|test-rls-db|auth-harness|rls-policy\.test|rls-helpers\.test)/.test(
				path,
			) ||
			/from ["']\.\/(test-db|test-rls-db|auth-harness)/.test(content.toString())
		)
			files.delete(path);
	}
	replace(
		files,
		"vitest.config.ts",
		'\t\tglobalSetup: ["./src/__tests__/global-setup.ts"],\n',
		"",
	);
	files.set(
		".env.example",
		text(files, ".env.example").replace(
			/# —————————————————— Database[\s\S]*?(?=# ——————————————————)/,
			"",
		),
	);
	const service = text(files, "src/services/admin-security.ts");
	const start = service.indexOf("\tawait db.transaction(async (tx) => {");
	const end = service.indexOf("\n\t});", start);
	if (start < 0 || end < 0)
		throw new Error("Credential revocation anchor changed.");
	files.set(
		"src/services/admin-security.ts",
		service.slice(0, start) +
			(selection.database === "bun-sqlite"
				? `\t// Bun SQLite transactions must stay synchronous.
	db.transaction((tx) => {
		tx.delete(oauthAccessToken).where(eq(oauthAccessToken.userId, userId)).run();
		tx.delete(oauthRefreshToken).where(eq(oauthRefreshToken.userId, userId)).run();
		tx.delete(session).where(eq(session.userId, userId)).run();
		tx.update(user).set({ tokensRevokedAt: new Date() }).where(eq(user.id, userId)).run();
	});`
				: `\tawait db.batch([
	db.delete(oauthAccessToken).where(eq(oauthAccessToken.userId, userId)),
	db.delete(oauthRefreshToken).where(eq(oauthRefreshToken.userId, userId)),
	db.delete(session).where(eq(session.userId, userId)),
	db.update(user).set({ tokensRevokedAt: new Date() }).where(eq(user.id, userId)),
]);`) +
			service.slice(end + "\n\t});".length),
	);
	if (
		selection.database === "turso-cloud" ||
		selection.database === "turso-local"
	) {
		await configureTurso(context);
	} else if (selection.database === "bun-sqlite") {
		await configureBunSQLite(context);
	} else {
		files.set(
			"src/db/index.ts",
			`import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
export function createDB(binding: D1Database) { return drizzle(binding, { schema }); }
export type Database = ReturnType<typeof createDB>;
`,
		);
		replace(files, "src/middlewares/database.ts", "env.HYPERDRIVE", "env.DB");
		replace(
			files,
			"worker-configuration.d.ts",
			"interface __BaseEnv_Env {",
			"interface __BaseEnv_Env {\n\tDB: D1Database;",
		);
		files.set(
			"drizzle.config.ts",
			`import { defineConfig } from "drizzle-kit";
export default defineConfig({ out: "./drizzle", schema: "./src/db/schema.ts", dialect: "sqlite" });
`,
		);
		pkg.scripts["db:migrate"] = "wrangler d1 migrations apply DB --local";
		pkg.scripts["db:migrate:remote"] =
			"wrangler d1 migrations apply DB --remote";
		delete pkg.scripts["db:push"];
		delete pkg.scripts["db:studio"];
		files.set(
			"src/__tests__/database-adapter.test.ts",
			await readFile(new URL("../../assets/d1.test.ts", import.meta.url)),
		);
	}
	if (selection.deployment === "cloudflare") {
		replace(
			files,
			"worker-configuration.d.ts",
			"\tHYPERDRIVE: Hyperdrive;\n",
			"",
		);
		files.set(
			"wrangler.jsonc",
			text(files, "wrangler.jsonc").replace(
				/\t"hyperdrive": \[[\s\S]*?\n\t\],\n/,
				selection.database === "d1"
					? `\t"d1_databases": [{ "binding": "DB", "database_name": "${context.name}", "database_id": "00000000-0000-0000-0000-000000000000", "migrations_dir": "drizzle" }],\n`
					: "",
			),
		);
	}
	// Bundle checked-in migrations generated by drizzle-kit for the SQLite schema.
	const { readdir } = await import("node:fs/promises");
	const migrationRoot = new URL(
		"../../assets/sqlite-migrations/",
		import.meta.url,
	);
	for (const entry of await readdir(migrationRoot, {
		recursive: true,
		withFileTypes: true,
	})) {
		if (!entry.isFile()) continue;
		const path = join(entry.parentPath, entry.name);
		const name = relative(fileURLToPath(migrationRoot), path);
		files.set(`drizzle/${name}`, await readFile(path));
	}
}

async function configureTurso({ files, pkg, selection }) {
	const cloud = selection.database === "turso-cloud";
	pkg.dependencies["@libsql/client"] = "^0.17.0";
	files.set(
		"src/db/index.ts",
		`import { createClient } from "${selection.deployment === "cloudflare" ? "@libsql/client/web" : "@libsql/client"}";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
export function createDB(url: string${cloud ? ", authToken: string" : ""}) {
	return drizzle(createClient({ url${cloud ? ", authToken" : ""} }), { schema });
}
export type Database = ReturnType<typeof createDB>;
`,
	);
	files.set(
		"src/middlewares/database.ts",
		`import { createMiddleware } from "@tanstack/react-start";
import { createDB } from "@/db";
import { env } from "@/env";
${selection.deployment === "cloudflare" ? "" : "let database: ReturnType<typeof createDB> | undefined;"}
export const databaseMiddleware = createMiddleware().server(({ next }) => {
	${selection.deployment === "cloudflare" ? "const database =" : "database ??="} createDB(env.TURSO_DATABASE_URL${cloud ? ", env.TURSO_AUTH_TOKEN" : ""});
	return next({ context: { db: database } });
});
`,
	);
	replace(
		files,
		"src/env.ts",
		"\t\t\tAPP_ORIGIN: z.url(),",
		`${
			cloud
				? '\t\t\tTURSO_DATABASE_URL: z.string().regex(/^(libsql|https):\\/\\//, "Use a remote Turso Cloud URL"),\n\t\t\tTURSO_AUTH_TOKEN: z.string().min(1),'
				: '\t\t\tTURSO_DATABASE_URL: z.string().startsWith("file:"),'
		}\n\t\t\tAPP_ORIGIN: z.url(),`,
	);
	files.set(
		".env.example",
		`${text(files, ".env.example")}\n${
			cloud
				? "# Turso Cloud: copy the URL and token from your Turso database.\nTURSO_DATABASE_URL=libsql://your-database.turso.io\nTURSO_AUTH_TOKEN=replace-with-your-turso-auth-token"
				: "# Turso Local: a local libSQL file; no cloud credentials required.\nTURSO_DATABASE_URL=file:local.db"
		}\n`,
	);
	files.set(
		"drizzle.config.ts",
		`import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
config({ path: ".env" }); config({ path: ".env.local", override: true });
export default defineConfig({ out: "./drizzle", schema: "./src/db/schema.ts", dialect: "turso", dbCredentials: { url: process.env.TURSO_DATABASE_URL ?? "${cloud ? "" : "file:local.db"}"${cloud ? ", authToken: process.env.TURSO_AUTH_TOKEN" : ""} } });
`,
	);
	files.set(
		"src/__tests__/database-adapter.test.ts",
		await readFile(new URL("../../assets/turso.test.ts", import.meta.url)),
	);
	pkg.scripts["db:migrate"] = "bun scripts/migrate-turso.ts";
	files.set(
		"scripts/migrate-turso.ts",
		`import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
const url = process.env.TURSO_DATABASE_URL;
if (!url${cloud ? " || !/^(libsql|https):\\/\\//.test(url) || !process.env.TURSO_AUTH_TOKEN" : ' || !url.startsWith("file:")'}) throw new Error("${cloud ? "Set a remote TURSO_DATABASE_URL and TURSO_AUTH_TOKEN" : "Set a file: TURSO_DATABASE_URL"} in .env before running migrations.");
const client = createClient({ url${cloud ? ", authToken: process.env.TURSO_AUTH_TOKEN" : ""} });
try { await migrate(drizzle(client), { migrationsFolder: "./drizzle" }); }
finally { client.close(); }
`,
	);
	if (cloud) {
		replace(
			files,
			"scripts/validate-prod-env.ts",
			'\t"APP_ORIGIN",',
			'\t"TURSO_DATABASE_URL",\n\t"TURSO_AUTH_TOKEN",\n\t"APP_ORIGIN",',
		);
		replace(
			files,
			"scripts/validate-prod-env.ts",
			"\tBETTER_AUTH_SECRET:",
			'\tTURSO_AUTH_TOKEN: "replace-with-your-turso-auth-token",\n\tTURSO_DATABASE_URL: "libsql://your-database.turso.io",\n\tBETTER_AUTH_SECRET:',
		);
	}
	files.set(
		".gitignore",
		`${text(files, ".gitignore")}\n*.db\n*.db-shm\n*.db-wal\n`,
	);
}

async function configureBunSQLite({ files, pkg }) {
	pkg.scripts.dev = "bun --bun vite dev --port 3000";
	files.set(
		"src/db/index.ts",
		`import { Database as SQLite } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";
export function createDB(filename: string) {
	const client = new SQLite(filename, { create: true, strict: true });
	client.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
	return drizzle(client, { schema });
}
export type Database = ReturnType<typeof createDB>;
`,
	);
	files.set(
		"src/middlewares/database.ts",
		`import { createMiddleware } from "@tanstack/react-start";
import { createDB } from "@/db";
import { env } from "@/env";
let database: ReturnType<typeof createDB> | undefined;
export const databaseMiddleware = createMiddleware().server(({ next }) => {
	database ??= createDB(env.SQLITE_DATABASE_PATH);
	return next({ context: { db: database } });
});
`,
	);
	replace(
		files,
		"src/env.ts",
		"\t\t\tAPP_ORIGIN: z.url(),",
		"\t\t\tSQLITE_DATABASE_PATH: z.string().min(1),\n\t\t\tAPP_ORIGIN: z.url(),",
	);
	files.set(
		".env.example",
		`${text(files, ".env.example")}\n# Bun native SQLite file. Keep this file on persistent storage.\nSQLITE_DATABASE_PATH=local.db\n`,
	);
	files.set(
		"drizzle.config.ts",
		`import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
config({ path: ".env" }); config({ path: ".env.local", override: true });
export default defineConfig({ out: "./drizzle", schema: "./src/db/schema.ts", dialect: "sqlite", dbCredentials: { url: process.env.SQLITE_DATABASE_PATH ?? "local.db" } });
`,
	);
	pkg.scripts["db:migrate"] = "bun scripts/migrate-bun-sqlite.ts";
	files.set(
		"scripts/migrate-bun-sqlite.ts",
		`import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createDB } from "../src/db";
const filename = process.env.SQLITE_DATABASE_PATH;
if (!filename) throw new Error("Set SQLITE_DATABASE_PATH in .env before running migrations.");
const db = createDB(filename);
try { migrate(db, { migrationsFolder: "./drizzle" }); }
finally { db.$client.close(); }
`,
	);
	replace(
		files,
		"vite.config.ts",
		"\tresolve: { tsconfigPaths: true },",
		'\tresolve: { tsconfigPaths: true },\n\tssr: { external: ["bun:sqlite"] },',
	);
	files.set(
		"src/__tests__/database-adapter.test.ts",
		await readFile(new URL("../../assets/bun-sqlite.test.ts", import.meta.url)),
	);
	replace(
		files,
		"vitest.config.ts",
		"\t\ttestTimeout: 30_000,",
		'\t\texclude: ["src/__tests__/database-adapter.test.ts"],\n\t\ttestTimeout: 30_000,',
	);
	for (const command of ["test", "test:unit"])
		pkg.scripts[command] +=
			" && bun test src/__tests__/database-adapter.test.ts";
	files.set(
		".gitignore",
		`${text(files, ".gitignore")}\n*.db\n*.db-shm\n*.db-wal\n`,
	);
}
