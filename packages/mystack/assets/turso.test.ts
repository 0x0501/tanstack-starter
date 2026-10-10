import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/db/schema";
import { purchase, purchaseDelivery, session, user } from "@/db/schema";
import { revokeUserCredentials } from "@/services/admin-security";
import { createPendingPurchase, markPurchasePaid } from "@/services/purchase";
import { eq } from "drizzle-orm";
const temporary = mkdtempSync(join(tmpdir(), "mystack-db-"));
const db = drizzle(createClient({ url: `file:${join(temporary, "test.db")}` }), { schema });
beforeAll(async () => {
	await db.$client.executeMultiple(await readFile("drizzle/0000_thin_phalanx.sql", "utf8"));
	await db.insert(user).values({ id: "test-user", email: "test@example.com", name: "Test", emailVerified: true });
});
afterAll(() => { db.$client.close(); rmSync(temporary, { recursive: true, force: true }); });
test("concurrent confirmations deliver a purchase once", async () => {
	const { purchaseId } = await createPendingPurchase(db, { userId: "test-user", provider: "stripe", externalId: "checkout-1", amount: 500 });
	const outcomes = await Promise.all([1, 2].map(() => markPurchasePaid(db, { provider: "stripe", externalId: "checkout-1", reportedAmount: 500 })));
	expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(["already_paid", "fulfilled"]);
	expect((await db.select().from(purchase).where(eq(purchase.id, purchaseId)))[0].status).toBe("paid");
	expect(await db.select().from(purchaseDelivery).where(eq(purchaseDelivery.purchaseId, purchaseId))).toHaveLength(1);
});
test("failed delivery insertion rolls back the paid flip and permits retry", async () => {
	const { purchaseId } = await createPendingPurchase(db, { userId: "test-user", provider: "stripe", externalId: "checkout-2", amount: 500 });
	await db.$client.execute("CREATE TRIGGER reject_delivery BEFORE INSERT ON purchase_delivery BEGIN SELECT RAISE(ABORT, 'reject'); END");
	try { await expect(markPurchasePaid(db, { provider: "stripe", externalId: "checkout-2" })).rejects.toThrow(); }
	finally { await db.$client.execute("DROP TRIGGER reject_delivery"); }
	expect((await db.select().from(purchase).where(eq(purchase.id, purchaseId)))[0].status).toBe("pending");
	expect((await markPurchasePaid(db, { provider: "stripe", externalId: "checkout-2" })).status).toBe("fulfilled");
});
test("credential revocation clears sessions and records token revocation time", async () => {
	await db.insert(session).values({ id: "test-session", userId: "test-user", token: "test-token", expiresAt: new Date(Date.now() + 60_000) });
	await revokeUserCredentials(db, "test-user");
	expect(await db.select().from(session)).toEqual([]);
	expect((await db.select().from(user).where(eq(user.id, "test-user")))[0].tokensRevokedAt).toBeInstanceOf(Date);
});
