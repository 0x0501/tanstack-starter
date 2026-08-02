/**
 * Local-only seed: verified email/password users for sign-in.
 *
 * Usage:
 *   bun run db:seed
 *   bun run db:seed -- --admin-only
 *   bun run db:seed -- --user-only
 *
 * Env (optional overrides — defaults are fine for local dev):
 *   DATABASE_MIGRATION_URL   required direct Postgres URL
 *   SEED_ADMIN_EMAIL         default admin@localhost.dev
 *   SEED_ADMIN_PASSWORD      default AdminPass1!
 *   SEED_ADMIN_NAME          default Local Admin
 *   SEED_ADMIN_ROLE          default superadmin  (admin | superadmin)
 *   SEED_USER_EMAIL          default user@localhost.dev
 *   SEED_USER_PASSWORD       default UserPass1!
 *   SEED_USER_NAME           default Local User
 *   SEED_FORCE=1             allow non-localhost URLs (still refuse prod markers)
 */
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { account, user } from "../src/db/auth.schema";
import {
	assertEmailLimits,
	assertPasswordRules,
} from "../src/utils/input-rules";

config({ path: [".env.local", ".env"] });

const DEFAULTS = {
	admin: {
		email: "admin@localhost.dev",
		password: "AdminPass1!",
		name: "Local Admin",
		role: "superadmin" as const,
	},
	user: {
		email: "user@localhost.dev",
		password: "UserPass1!",
		name: "Local User",
		role: "user" as const,
	},
} as const;

type SeedRole = "user" | "admin" | "superadmin";

type SeedSpec = {
	email: string;
	password: string;
	name: string;
	role: SeedRole;
	label: string;
};

function env(name: string, fallback: string): string {
	const v = process.env[name]?.trim();
	return v && v.length > 0 ? v : fallback;
}

function parseArgs(argv: string[]) {
	const flags = new Set(argv.filter((a) => a.startsWith("--")));
	return {
		adminOnly: flags.has("--admin-only"),
		userOnly: flags.has("--user-only"),
		help: flags.has("--help") || flags.has("-h"),
	};
}

function assertLocalDbUrl(url: string): void {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error(`DATABASE_MIGRATION_URL is not a valid URL: ${url}`);
	}
	const host = parsed.hostname.toLowerCase();
	const local =
		host === "localhost" ||
		host === "127.0.0.1" ||
		host === "::1" ||
		host === "0.0.0.0" ||
		host.endsWith(".local");
	const forced = process.env.SEED_FORCE === "1";
	if (!local && !forced) {
		throw new Error(
			`Refusing to seed non-local database host "${host}".\n` +
				`Use a local Postgres URL, or set SEED_FORCE=1 if you really mean it.`,
		);
	}
	const prodMarkers = ["prod", "production", "neon.tech", "supabase.co"];
	const hay = url.toLowerCase();
	if (prodMarkers.some((m) => hay.includes(m)) && process.env.SEED_FORCE !== "1") {
		throw new Error(
			`DATABASE_MIGRATION_URL looks production-like. Refusing without SEED_FORCE=1.`,
		);
	}
}

function parseRole(raw: string): SeedRole {
	if (raw === "user" || raw === "admin" || raw === "superadmin") return raw;
	throw new Error(
		`Invalid SEED_ADMIN_ROLE "${raw}". Use user | admin | superadmin.`,
	);
}

function validateCredentials(email: string, password: string, who: string) {
	try {
		assertEmailLimits(email);
		assertPasswordRules(password);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		throw new Error(`${who}: ${msg}`);
	}
	if (!email.includes("@")) {
		throw new Error(`${who}: email must look like an address.`);
	}
}

async function upsertUser(
	db: ReturnType<typeof drizzle>,
	spec: SeedSpec,
): Promise<"created" | "updated"> {
	const email = spec.email.toLowerCase();
	const hashed = await hashPassword(spec.password);
	const now = new Date();

	const [existing] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, email))
		.limit(1);

	if (existing) {
		await db
			.update(user)
			.set({
				name: spec.name,
				role: spec.role,
				emailVerified: true,
				banned: false,
				banReason: null,
				banExpires: null,
				updatedAt: now,
			})
			.where(eq(user.id, existing.id));

		const [cred] = await db
			.select({ id: account.id })
			.from(account)
			.where(
				and(
					eq(account.userId, existing.id),
					eq(account.providerId, "credential"),
				),
			)
			.limit(1);

		if (cred) {
			await db
				.update(account)
				.set({ password: hashed, updatedAt: now })
				.where(eq(account.id, cred.id));
		} else {
			await db.insert(account).values({
				id: randomUUID(),
				accountId: existing.id,
				providerId: "credential",
				userId: existing.id,
				password: hashed,
				createdAt: now,
				updatedAt: now,
			});
		}
		return "updated";
	}

	const id = randomUUID();
	await db.insert(user).values({
		id,
		name: spec.name,
		email,
		emailVerified: true,
		role: spec.role,
		banned: false,
		twoFactorEnabled: false,
		locale: "en",
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(account).values({
		id: randomUUID(),
		accountId: id,
		providerId: "credential",
		userId: id,
		password: hashed,
		createdAt: now,
		updatedAt: now,
	});
	return "created";
}

function printHelp() {
	console.log(`seed-local — insert verified local users for sign-in

Usage:
  bun run db:seed
  bun run db:seed -- --admin-only
  bun run db:seed -- --user-only

Defaults:
  Superadmin  ${DEFAULTS.admin.email}  /  ${DEFAULTS.admin.password}
  User        ${DEFAULTS.user.email}   /  ${DEFAULTS.user.password}

Requires DATABASE_MIGRATION_URL (direct Postgres, same as drizzle migrate).
Passwords must satisfy Starter rules: 8–32 chars, letter + digit + symbol.
`);
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) {
		printHelp();
		process.exit(0);
	}
	if (args.adminOnly && args.userOnly) {
		throw new Error("Use only one of --admin-only or --user-only.");
	}

	const databaseUrl = process.env.DATABASE_MIGRATION_URL?.trim();
	if (!databaseUrl) {
		throw new Error(
			"DATABASE_MIGRATION_URL is required (direct Postgres URL for local seed).",
		);
	}
	assertLocalDbUrl(databaseUrl);

	const adminSpec: SeedSpec = {
		label: "admin",
		email: env("SEED_ADMIN_EMAIL", DEFAULTS.admin.email),
		password: env("SEED_ADMIN_PASSWORD", DEFAULTS.admin.password),
		name: env("SEED_ADMIN_NAME", DEFAULTS.admin.name),
		role: parseRole(env("SEED_ADMIN_ROLE", DEFAULTS.admin.role)),
	};
	const userSpec: SeedSpec = {
		label: "user",
		email: env("SEED_USER_EMAIL", DEFAULTS.user.email),
		password: env("SEED_USER_PASSWORD", DEFAULTS.user.password),
		name: env("SEED_USER_NAME", DEFAULTS.user.name),
		role: "user",
	};

	const specs: SeedSpec[] = [];
	if (!args.userOnly) specs.push(adminSpec);
	if (!args.adminOnly) specs.push(userSpec);

	for (const s of specs) {
		validateCredentials(s.email, s.password, s.label);
	}

	const pool = new Pool({ connectionString: databaseUrl });
	const db = drizzle(pool);

	try {
		// Fail fast with a clear message if the DB is down or migrations missing.
		await pool.query('select 1 from "user" limit 0');
	} catch (e) {
		await pool.end().catch(() => undefined);
		const msg = e instanceof Error ? e.message : String(e);
		if (/password authentication failed|ECONNREFUSED|ENOTFOUND/i.test(msg)) {
			throw new Error(
				`Cannot connect to Postgres (${msg}).\n` +
					`Check DATABASE_MIGRATION_URL and that Postgres is running.`,
			);
		}
		if (/relation ["']?user["']? does not exist/i.test(msg)) {
			throw new Error(
				`Table "user" not found. Run migrations first:\n  bun run db:migrate`,
			);
		}
		throw e;
	}

	try {
		console.log("Seeding local users…\n");
		const rows: {
			label: string;
			email: string;
			password: string;
			role: string;
			status: string;
		}[] = [];

		for (const spec of specs) {
			const status = await upsertUser(db, spec);
			rows.push({
				label: spec.label,
				email: spec.email.toLowerCase(),
				password: spec.password,
				role: spec.role,
				status,
			});
			console.log(
				`  [${status}] ${spec.role.padEnd(11)} ${spec.email.toLowerCase()}`,
			);
		}

		console.log(
			"\nSign-in credentials (local only — change before any shared env):\n",
		);
		console.table(
			rows.map((r) => ({
				role: r.role,
				email: r.email,
				password: r.password,
				status: r.status,
			})),
		);
		console.log("Done. Open /sign-in and use an email above.");
	} finally {
		await pool.end();
	}
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});
