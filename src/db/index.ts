import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";

export function createDB(connection: Hyperdrive) {
	const client = new Pool({
		connectionString: connection.connectionString,
	});

	return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDB>;
export type DatabaseTxCallback = Parameters<Database["transaction"]>[0];
export type DatabaseTx = Parameters<DatabaseTxCallback>[0];
