/**
 * Drizzle-backed PurchaseFulfillmentPort for production webhooks.
 */
import { and, eq } from "drizzle-orm";
import type { Database } from "@/db";
import { adminAction, purchase } from "@/db/schema";
import type {
	Purchase,
	PurchaseFulfillmentPort,
	PurchaseProvider,
	PurchaseStatus,
} from "./purchase";

/** Parse minor-unit amount stored as decimal text (no float parse). */
function parseMinorUnits(amount: string): number {
	if (!/^-?\d+$/.test(amount)) {
		throw new Error(`Invalid purchase amount: ${amount}`);
	}
	const n = Number.parseInt(amount, 10);
	if (!Number.isSafeInteger(n)) {
		throw new Error(`Purchase amount outside safe integer range: ${amount}`);
	}
	return n;
}

function rowToPurchase(row: typeof purchase.$inferSelect): Purchase {
	return {
		id: row.id,
		userId: row.userId,
		provider: row.provider as PurchaseProvider,
		externalId: row.externalId,
		amount: parseMinorUnits(row.amount),
		currency: row.currency,
		status: row.status as PurchaseStatus,
		paidAt: row.paidAt,
	};
}

export function createPurchasePort(db: Database): PurchaseFulfillmentPort {
	return {
		async findByProviderExternal(provider, externalId) {
			const [row] = await db
				.select()
				.from(purchase)
				.where(
					and(
						eq(purchase.provider, provider),
						eq(purchase.externalId, externalId),
					),
				)
				.limit(1);
			return row ? rowToPurchase(row) : null;
		},
		async tryMarkPaid(id) {
			const now = new Date();
			const flipped = await db
				.update(purchase)
				.set({ status: "paid", paidAt: now })
				.where(and(eq(purchase.id, id), eq(purchase.status, "pending")))
				.returning();
			return flipped[0] ? rowToPurchase(flipped[0]) : null;
		},
		async logAudit(entry) {
			await db.insert(adminAction).values({
				id: crypto.randomUUID(),
				actorId: null,
				action: entry.action,
				targetType: "purchase",
				targetId: entry.targetId ?? null,
				detail: entry.detail ?? null,
			});
		},
	};
}

export async function createPendingPurchase(
	db: Database,
	input: {
		userId: string;
		provider: PurchaseProvider;
		externalId: string;
		amount: number;
		currency?: string;
	},
): Promise<{ purchaseId: string }> {
	const id = crypto.randomUUID();
	await db.insert(purchase).values({
		id,
		userId: input.userId,
		provider: input.provider,
		externalId: input.externalId,
		amount: String(input.amount),
		currency: input.currency ?? "usd",
		status: "pending",
	});
	return { purchaseId: id };
}
