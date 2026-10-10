import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, test } from "vitest";
import { getPlatformProxy } from "wrangler";
import { createDB, type Database } from "@/db";
import { purchase, purchaseDelivery, session, user } from "@/db/schema";
import { revokeUserCredentials } from "@/services/admin-security";
import { createPendingPurchase, markPurchasePaid } from "@/services/purchase";
let db: Database;
let dispose: () => Promise<void>;
let binding: D1Database;
beforeAll(async () => {
	const proxy = await getPlatformProxy<{ DB: D1Database }>({ configPath: "wrangler.jsonc", persist: false });
	dispose = proxy.dispose;
	binding = proxy.env.DB;
	const migration = await readFile("drizzle/0000_thin_phalanx.sql", "utf8");
	for (const statement of migration.split("--> statement-breakpoint")) if (statement.trim()) await binding.prepare(statement).run();
	db = createDB(binding);
	await db.insert(user).values({ id: "test-user", email: "test@example.com", name: "Test", emailVerified: true });
});
afterAll(async () => { await dispose?.(); });
test("concurrent confirmations create one durable delivery event", async () => {
	const { purchaseId } = await createPendingPurchase(db, { userId: "test-user", provider: "stripe", externalId: "checkout-1", amount: 500 });
	const outcomes = await Promise.all([1, 2].map(() => markPurchasePaid(db, { provider: "stripe", externalId: "checkout-1", reportedAmount: 500 })));
	expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(["already_paid", "fulfilled"]);
	expect(await db.select().from(purchaseDelivery).where(eq(purchaseDelivery.purchaseId, purchaseId))).toHaveLength(1);
});
test("a failed delivery insert rolls back the paid flip and allows retry", async () => {
	const { purchaseId } = await createPendingPurchase(db, { userId: "test-user", provider: "stripe", externalId: "checkout-2", amount: 500 });
	await binding.prepare("CREATE TRIGGER reject_delivery BEFORE INSERT ON purchase_delivery BEGIN SELECT RAISE(ABORT, 'reject'); END").run();
	try { await expect(markPurchasePaid(db, { provider: "stripe", externalId: "checkout-2" })).rejects.toThrow(); }
	finally { await binding.prepare("DROP TRIGGER reject_delivery").run(); }
	expect((await db.select().from(purchase).where(eq(purchase.id, purchaseId)))[0].status).toBe("pending");
	expect((await markPurchasePaid(db, { provider: "stripe", externalId: "checkout-2" })).status).toBe("fulfilled");
});
test("credential revocation clears sessions and records token revocation time", async () => {
	await db.insert(session).values({ id: "test-session", userId: "test-user", token: "test-token", expiresAt: new Date(Date.now() + 60_000) });
	await revokeUserCredentials(db, "test-user");
	expect(await db.select().from(session)).toEqual([]);
	expect((await db.select().from(user).where(eq(user.id, "test-user")))[0].tokensRevokedAt).toBeInstanceOf(Date);
});
