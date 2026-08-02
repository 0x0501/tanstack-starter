import { eq } from "drizzle-orm";
import type { Database } from "@/db";
import { oauthClient } from "@/db/schema";

/** Returns false when there was no such client. */
export async function deleteOAuthClientById(
	db: Database,
	clientId: string,
): Promise<boolean> {
	const deleted = await db
		.delete(oauthClient)
		.where(eq(oauthClient.clientId, clientId))
		.returning({ clientId: oauthClient.clientId });
	return deleted.length > 0;
}
