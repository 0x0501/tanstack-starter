import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterEach, inject } from "vitest";
import type { Database as AppDatabase } from "@/db";
import * as schema from "@/db/schema";

/**
 * Whether this run has a Postgres container behind it.
 *
 * `SKIP_TESTCONTAINERS=1` (what `bun run test:unit` sets) makes global setup
 * provide empty URIs. Suites that need a database gate on this with
 * `describe.skipIf(!hasTestDatabase)` — the no-Docker path has to be green, or
 * nobody can tell a missing container from a real regression.
 */
export const hasTestDatabase = process.env.SKIP_TESTCONTAINERS !== "1";

const pools: Pool[] = [];

afterEach(async () => {
	await Promise.all(pools.splice(0).map((pool) => pool.end()));
});

/**
 * Superuser pool against the run-wide testcontainer. Each call uses a single
 * connection so CREATE TEMP TABLE DDL stays invisible to other tests.
 */
export async function createTestDatabase(ddl: string): Promise<AppDatabase> {
	const pool = new Pool({ connectionString: inject("pgUri"), max: 1 });
	pools.push(pool);
	await pool.query(ddl);
	return drizzle(pool, { schema }) as unknown as AppDatabase;
}
