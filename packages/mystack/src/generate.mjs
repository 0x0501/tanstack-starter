import { execFile } from "node:child_process";
import {
	mkdir,
	mkdtemp,
	readdir,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Generator, getConfig } from "@tanstack/router-generator";
import { configureDatabase } from "./adapters/database.mjs";
import { configureDeployment } from "./adapters/deployment.mjs";
import { configureEmail } from "./adapters/email.mjs";
import { configurePayments } from "./adapters/payments.mjs";
import { catalog, isPostgres, validateSelection } from "./catalog.mjs";
import { readTemplate, text } from "./template.mjs";

export function validateName(name) {
	if (!/^[a-z][a-z0-9-]{0,57}$/.test(name))
		throw new Error(
			"Project name must start with a lowercase letter and contain at most 58 lowercase letters, digits or hyphens.",
		);
	return name;
}

const bundledTemplateRoot = fileURLToPath(
	new URL("../template", import.meta.url),
);

export async function renderProject({
	name,
	selection,
	templateRoot = bundledTemplateRoot,
}) {
	validateName(name);
	validateSelection(selection);
	const files = await readTemplate(templateRoot, {
		packaged: templateRoot === bundledTemplateRoot,
	});
	const pkg = JSON.parse(text(files, "package.json"));
	pkg.name = name;
	delete pkg.pnpm;
	for (const key of ["mystack", "cli:prepare", "test:cli"])
		delete pkg.scripts[key];
	const context = { files, pkg, name, selection };
	await configureDeployment(context);
	await configureDatabase(context);
	await configureEmail(context);
	await configurePayments(context);
	files.set("package.json", `${JSON.stringify(pkg, null, "\t")}\n`);
	files.set(
		"mystack.json",
		`${JSON.stringify({ version: 1, ...selection }, null, "\t")}\n`,
	);
	files.set(
		"tsconfig.json",
		text(files, "tsconfig.json").replace(
			/ {2}"exclude": \["packages\/mystack\/assets".*\n/,
			"",
		),
	);
	files.set("README.md", projectReadme(context));
	return files;
}

export async function createProject({
	name,
	selection,
	cwd = process.cwd(),
	templateRoot = bundledTemplateRoot,
	onProgress = () => {},
}) {
	validateName(name);
	validateSelection(selection);
	const target = resolve(cwd, name);
	// Reserve a new directory exclusively. Never overwrite even an empty existing
	// directory, and never remove user files if installation later fails.
	await mkdir(target);
	let staging;
	try {
		staging = await mkdtemp(join(cwd, ".mystack-"));
		onProgress("Creating project files...");
		const files = await renderProject({ name, selection, templateRoot });
		for (const [path, contents] of files) {
			await mkdir(dirname(join(staging, path)), { recursive: true });
			await writeFile(join(staging, path), contents);
		}
		onProgress("Generating routes...");
		await new Generator({
			config: getConfig({ disableLogging: true }, staging),
			root: staging,
		}).run();
		onProgress("Formatting project files...");
		const biome = createRequire(import.meta.url).resolve(
			"@biomejs/biome/bin/biome",
		);
		await promisify(execFile)(process.execPath, [biome, "check", "--write"], {
			cwd: staging,
		});
		// Import organization can change formatter decisions; format the fixed AST.
		await promisify(execFile)(process.execPath, [biome, "format", "--write"], {
			cwd: staging,
		});
		if ((await readdir(target)).length)
			throw new Error(
				"Destination changed during generation; refusing to overwrite it.",
			);
		await rename(staging, target);
		return target;
	} catch (error) {
		if (staging) await rm(staging, { recursive: true, force: true });
		// Only remove our reservation if it is still empty.
		const { rmdir } = await import("node:fs/promises");
		await rmdir(target).catch(() => {});
		throw error;
	}
}

function projectReadme({ name, selection }) {
	const label = (category, id) =>
		catalog[category].find((option) => option.id === id).label;
	const databaseNotes = {
		pg: "PostgreSQL connects directly through DATABASE_URL using the application role. DATABASE_MIGRATION_URL is privileged and is only for migrations. Use Docker for local development.",
		"pg-hyperdrive":
			"PostgreSQL connects through the Cloudflare HYPERDRIVE binding. Local development uses hyperdrive.localConnectionString in wrangler.jsonc; production requires your Hyperdrive configuration ID. DATABASE_MIGRATION_URL is only for migrations.",
		d1: "Cloudflare D1 uses the DB binding in wrangler.jsonc. db:migrate applies local migrations; db:migrate:remote applies them to the configured Cloudflare database.",
		"turso-cloud":
			"Turso Cloud uses a remote database. Set TURSO_DATABASE_URL (libsql:// or https://) and TURSO_AUTH_TOKEN from your Turso database before running migrations or starting the app. This option never opens a local SQLite file. Database service tests use an isolated local libSQL fixture; they do not access your cloud database.",
		"turso-local":
			"Turso Local uses @libsql/client with a file: URL (TURSO_DATABASE_URL=file:local.db). No Turso Cloud token is required. Keep the database file on persistent storage when deploying.",
		"bun-sqlite":
			"Bun SQLite uses the native bun:sqlite driver, with SQLITE_DATABASE_PATH=local.db. Run the app with Bun and keep the database file on persistent storage. Native database tests run with bun test after Vitest.",
	};
	return `# ${name}

Generated with Mystack. Configuration is recorded in mystack.json.

Database: ${label("database", selection.database)}; runtime: ${label("deployment", selection.deployment)}; email: ${label("email", selection.email)}; payments: ${selection.payments.map((id) => label("payments", id)).join(", ") || "none"}.

## Database

${databaseNotes[selection.database]}

## Local development

\`\`\`sh
bun install
cp .env.example .env
# Configure the selected database and provider credentials in .env first.
${isPostgres(selection.database) ? "bun run db:up\nbun run db:migrate" : "bun run db:migrate"}
bun run dev
\`\`\`

Use http://localhost:3000. Authentication email is printed in development when credentials are absent.

## Production

Set a new BETTER_AUTH_SECRET and real application origins. Configure the selected database and verified email sender. Payment webhooks live at /api/webhooks/<provider>; set the matching signature secret and register that URL with each provider.

${selection.deployment === "cloudflare" ? "Configure wrangler.jsonc resource IDs, authenticate with wrangler login, create .env.prod, and run bun run deploy. Apply database migrations before deployment." : "Inject environment variables in the hosting environment, run bun run build, then bun run start. Apply database migrations before starting the server."}

${!isPostgres(selection.database) ? `SQLite payments commit a durable purchase_delivery event atomically with the paid state, using ${selection.database === "bun-sqlite" ? "a synchronous Bun SQLite transaction" : "the driver's atomic batch"}. Product fulfillment consumes these events using purchase_id as the idempotency key. SQLite authorization uses authenticated/admin middleware and explicit ownership predicates.\n\n` : ""}See DESIGN.md for presentation conventions.
`;
}
