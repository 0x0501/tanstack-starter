import { and, eq } from "drizzle-orm";
import type { Database } from "@/db";
import { purchaseDelivery, purchase as purchaseTable } from "@/db/schema";
export type PurchaseProvider = "stripe" | "creem" | "nowpayments";
export type PurchaseStatus = "pending" | "paid" | "failed";
export type Purchase = { id: string; userId: string; provider: PurchaseProvider; externalId: string; amount: number; currency: string; status: PurchaseStatus; paidAt: Date | null };
export type MarkPurchasePaidResult =
	| { status: "fulfilled" | "already_paid" | "not_pending" | "amount_mismatch"; purchase: Purchase }
	| { status: "not_found" };
function rowToPurchase(row: typeof purchaseTable.$inferSelect): Purchase {
	if (!/^\d+$/.test(row.amount) || !Number.isSafeInteger(Number(row.amount))) throw new Error("Invalid purchase amount.");
	return { id: row.id, userId: row.userId, provider: row.provider as PurchaseProvider, externalId: row.externalId, amount: Number(row.amount), currency: row.currency, status: row.status as PurchaseStatus, paidAt: row.paidAt };
}
export async function markPurchasePaid(db: Database, input: { provider: PurchaseProvider; externalId: string; reportedAmount?: number }): Promise<MarkPurchasePaidResult> {
	const where = and(eq(purchaseTable.provider, input.provider), eq(purchaseTable.externalId, input.externalId));
	const [existing] = await db.select().from(purchaseTable).where(where).limit(1);
	if (!existing) return { status: "not_found" };
	const purchase = rowToPurchase(existing);
	if (purchase.status === "paid") return { status: "already_paid", purchase };
	if (purchase.status !== "pending") return { status: "not_pending", purchase };
	if (input.reportedAmount !== undefined && purchase.amount !== input.reportedAmount) return { status: "amount_mismatch", purchase };
	const claim = crypto.randomUUID();
	const now = new Date();
	// The paid flip and delivery event commit together in a synchronous transaction.
	const flipped = db.transaction((tx) => {
		const row = tx.update(purchaseTable).set({ status: "paid", paidAt: now, fulfillmentKey: claim }).where(and(where, eq(purchaseTable.status, "pending"))).returning().get();
		if (row) tx.insert(purchaseDelivery).values({ purchaseId: row.id, createdAt: now }).run();
		return row;
	}, { behavior: "immediate" });
	if (flipped) return { status: "fulfilled", purchase: rowToPurchase(flipped) };
	const [again] = await db.select().from(purchaseTable).where(where).limit(1);
	return { status: again?.status === "paid" ? "already_paid" : "not_pending", purchase: again ? rowToPurchase(again) : purchase };
}
export async function createPendingPurchase(db: Database, input: { userId: string; provider: PurchaseProvider; externalId: string; amount: number; currency?: string }): Promise<{ purchaseId: string }> {
	const id = crypto.randomUUID();
	await db.insert(purchaseTable).values({ id, userId: input.userId, provider: input.provider, externalId: input.externalId, amount: String(input.amount), currency: input.currency ?? "usd", status: "pending" });
	return { purchaseId: id };
}
