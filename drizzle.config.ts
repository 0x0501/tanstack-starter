import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Local env: `.env` then optional overrides in `.env.local` (both gitignored).
// Mirrors Docker defaults from `.env.docker` / `.env.example`.
config({ path: ".env" });
config({ path: ".env.local", override: true });

const migrationUrl = process.env.DATABASE_MIGRATION_URL;

if (!migrationUrl) {
	console.warn(
		"[drizzle.config] DATABASE_MIGRATION_URL is unset. " +
			"Copy .env.example → .env and run `bun run db:up` for local Postgres.",
	);
}

export default defineConfig({
	out: "./drizzle",
	schema: "./src/db/schema.ts",
	dialect: "postgresql",
	...(migrationUrl ? { dbCredentials: { url: migrationUrl } } : {}),
	verbose: true,
	strict: true,
});
