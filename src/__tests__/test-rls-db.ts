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
 * Real migrations as `starter_app` (NOBYPASSRLS). Shared for the run — isolate
 * by unique user ids; do not truncate.
 */
export function createRlsAppDatabase(): AppDatabase {
	const pool = new Pool({ connectionString: inject("pgRlsAppUri"), max: 1 });
	pools.push(pool);
	return drizzle(pool, { schema }) as unknown as AppDatabase;
}
