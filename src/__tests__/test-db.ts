import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterEach, inject } from "vitest";
import type { Database as AppDatabase } from "@/db";
import * as schema from "@/db/schema";

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
