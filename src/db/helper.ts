import { sql } from "drizzle-orm";
import type { Database, DatabaseTx } from ".";

export async function setRlsUserId(
	tx: DatabaseTx,
	userId: string,
): Promise<void> {
	await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);
}

// SECURITY: `app.service` is a USERSET GUC that is_admin() and the RLS bypass
// trust. The app role is NOBYPASSRLS, so a SQL injection that can SET this GUC
// could escalate. Mitigate with parameterized queries only; a dedicated
// BYPASSRLS service role is a later hardening step.
export async function setRlsService(tx: DatabaseTx): Promise<void> {
	await tx.execute(sql`SELECT set_config('app.service', 'true', true)`);
}

export function withRlsUser<T>(
	db: Database,
	userId: string,
	fn: (tx: Database) => T | Promise<T>,
): Promise<T> {
	return db.transaction(async (tx) => {
		await setRlsUserId(tx, userId);
		return fn(tx as unknown as Database);
	});
}

export function withRlsService<T>(
	db: Database,
	fn: (tx: Database) => T | Promise<T>,
): Promise<T> {
	return db.transaction(async (tx) => {
		await setRlsService(tx);
		return fn(tx as unknown as Database);
	});
}
