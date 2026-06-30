import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/db/schema";

export function createDB(client: D1Database) {
    return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDB>;